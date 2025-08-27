/**
	•	CP Edge Function: cp-chat
	•	Version: m3.25-conversational
	•	
	•	Summary of changes:
	•		•	Natural conversation with memory: LLM handles warm conversation with proper memory of user responses
	•		•	Prevents extraction loops: explicit examples showing how to handle "I just told you!" scenarios
	•		•	Maintains structured data collection while feeling natural and supportive
	•		•	JSON format with conversational reply_to_user from LLM, validated server-side
*/

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* ──────────────────────────────────────────────────────────────────────────────
ENV & CONSTANTS
────────────────────────────────────────────────────────────────────────────── */

const ENV_OPENAI = Deno.env.get("OPENAI_API_KEY");
const DEV_UNSAFE_ALLOW_KEY = (Deno.env.get("DEV_UNSAFE_ALLOW_KEY") ?? "false").toLowerCase() === "true";

const CP_MODEL_DEFAULT = Deno.env.get("CP_MODEL_DEFAULT") ?? "gpt-5";          // deep / code
const CP_MODEL_MINI = Deno.env.get("CP_MODEL_MINI") ?? "gpt-4.1-mini";         // chat / brainstorm
const CP_PRICE_TABLE_RAW = Deno.env.get("CP_PRICE_TABLE") ?? "";
const CP_VERSION = "m3.25-conversational";

type PriceTable = Record<string, { in: number; out: number }>;
function parsePriceTable(): PriceTable { try { const j = JSON.parse(CP_PRICE_TABLE_RAW); if (j && typeof j === "object") return j as PriceTable; } catch {} return {}; }
const PRICE_TABLE = parsePriceTable();

const MODEL_CAPS: Record<string, { supports: { temperature: boolean; top_p: boolean } }> = {
"gpt-5": { supports: { temperature: false, top_p: false } },
"gpt-4.1-mini": { supports: { temperature: true, top_p: true } }
};

/* ──────────────────────────────────────────────────────────────────────────────
TYPES
────────────────────────────────────────────────────────────────────────────── */

type Tone = "eli5" | "intermediate" | "developer";
type Privacy = "Private" | "Share via link" | "Public";
type Auth = "Google OAuth" | "Magic email link" | "None (dev only)";
type DeepHours = "0.5" | "1" | "2" | "4+";

type Extracted = {
tone: Tone | null;
idea: string | null;
name: string | null;
audience: string | null;
features: string[];
privacy: Privacy | null;
auth: Auth | null;
deep_work_hours: DeepHours | null;
};

type SkipMap = Partial<Record<keyof Extracted, boolean>>;

type Envelope = {
success: boolean;
mode: "chat";
session_id: string;
turn_id: string;
reply_to_user: string;
confidence: "high" | "medium" | "low";
extracted: Extracted;
status: { complete: boolean; missing: string[]; next_question: string | null };
suggestions: string[];
error: { code: string | null; message: string | null };
meta: {
conversation_stage: "discovery" | "planning" | "generating" | "refining";
turn_count: number;
schema_version?: "1.0";
model?: string;
temperature?: number;
usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost?: { input_usd: number; output_usd: number; total_usd: number; currency: "USD" } };
skip_map?: SkipMap;
};
block: { language: "lovable-prompt" | "ts" | "js" | "json" | null; content: string | null; copy_safe: boolean } | null;
};

type ClientPayload = {
session_id?: string;
turn_count?: number;
user_input: string;
openai_api_key?: string;
memory?: {
extracted?: Partial<Extracted>;
skip_map?: SkipMap;
} | null;
};

/* ──────────────────────────────────────────────────────────────────────────────
SYSTEM PROMPT
────────────────────────────────────────────────────────────────────────────── */

const CONVERSATIONAL_SYSTEM_PROMPT = `You are CP, a smart Lovable project assistant. Make reasonable inferences and avoid repetitive summarization.

INTELLIGENCE RULES:
- Family apps = mobile-first (don't ask, just assume)
- Grocery lists + chores + family = clearly a household management app
- If user describes features multiple times, you understand the idea - don't keep asking for it
- Make smart assumptions instead of asking for every tiny detail

CONVERSATION RULES:
- STOP constant summarizing ("So we have X with Y and Z...")
- Ask ONE new question per turn, not recap everything
- If user gets frustrated ("I told you that!"), acknowledge and move forward immediately
- Show you understand without repeating everything back

MEMORY RULES:
- Once user describes their app concept clearly, you understand it - don't ask again
- Reference previous answers naturally, not in bullet-point summaries
- If they clarify something, incorporate it seamlessly

INFERENCE RULES:
- Family of 4 + grocery/chores = mobile household management app
- "Just for us" = private app, don't belabor privacy explanations
- Gmail users = Google auth makes sense
- Hobby project + family = keep it simple

JSON FORMAT:
{
  "reply_to_user": "Natural response - no repetitive summarizing",
  "extracted": {
    "idea": "household management app" (infer from context),
    "audience": "family of four",
    "features": ["shared grocery list", "chore assignments", "reminders"],
    "platform": "mobile" (infer for family apps),
    "name": "app name or null",
    "privacy": "Private" (infer from "just for us"),
    "auth": "Google OAuth",
    "deep_work_hours": "1"
  },
  "status": {
    "complete": true/false,
    "missing": ["only", "truly", "missing", "fields"]
  }
}

BETTER EXAMPLES:

Bad: "So we have FamTasker with shared grocery lists, chore assignments, and reminders, set to Private with Google OAuth. What's the main idea?"
Good: "Perfect! FamTasker sounds like exactly what your family needs. Should we start building it?"

Bad: "You mentioned audience is family of four. What's the main purpose?"  
Good: "Got it - a family organization app. What should we tackle first?"

Bad: Long recaps of everything discussed
Good: Short, natural acknowledgments that show understanding

Remember: Show intelligence through inference, not through repetitive summarization. Trust that you understand family app patterns.`
.trim();

/* ──────────────────────────────────────────────────────────────────────────────
HELPERS
────────────────────────────────────────────────────────────────────────────── */

function buildCorsHeaders(req: Request) {
const origin = req.headers.get("Origin") ?? "*";
const reqHdrs = req.headers.get("Access-Control-Request-Headers") ?? "authorization, apikey, content-type, x-client-info, x-cp-client";
const h = new Headers();
h.set("Access-Control-Allow-Origin", origin);
h.set("Vary", "Origin");
h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
h.set("Access-Control-Allow-Headers", reqHdrs);
h.set("X-CP-Version", CP_VERSION);
return h;
}
function withCors(req: Request, body: BodyInit | null, init: ResponseInit = {}) {
const headers = new Headers(init.headers || {});
buildCorsHeaders(req).forEach((v, k) => headers.set(k, v));
if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
return new Response(body, { ...init, headers });
}
function uuid(): string {
const cryptoAny = crypto as any;
if (cryptoAny.randomUUID) return cryptoAny.randomUUID();
return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
const r = (Math.random() * 16) | 0;
const v = c === "x" ? r : (r & 0x3) | 0x8;
return v.toString(16);
});
}
function tryJSON<T = any>(s: string): T | null { try { return JSON.parse(s) as T; } catch { return null; } }
function stripFences(s: string): string { return s.replace(/```[\s\S]*?\n/g, "").replace(/```/g, ""); }
function toText(v: unknown): string { if (v == null) return ""; if (typeof v === "string") return stripFences(v); try { const s = JSON.stringify(v); return s.length <= 200 ? s : JSON.stringify(v, null, 2); } catch { return String(v); } }

/* ──────────────────────────────────────────────────────────────────────────────
MODEL PICKING & TEMPERATURE
────────────────────────────────────────────────────────────────────────────── */

type Intent = "generate_code" | "brainstorm" | "chat";

function detectIntent(text: string): Intent {
const t = (text || "").toLowerCase();
if (t.includes("patch") || t.includes("one-block") || t.includes("code") || t.includes("prompt")) return "generate_code";
if (t.includes("idea") || t.includes("brainstorm") || t.includes("name") || t.includes("feature ideas")) return "brainstorm";
return "chat";
}
function pickModelAndTemp(intent: Intent) {
if (intent === "generate_code") return { model: CP_MODEL_DEFAULT, temperature: 0.2 };
if (intent === "brainstorm") return { model: CP_MODEL_MINI, temperature: 0.8 };
return { model: CP_MODEL_MINI, temperature: 0.3 };
}

/* ──────────────────────────────────────────────────────────────────────────────
ENVELOPE SCHEMA COERCION & DEFAULTS
────────────────────────────────────────────────────────────────────────────── */

const DEFAULT_EXTRACTED: Extracted = {
tone: "developer",
idea: null,
name: null,
audience: null,
features: [],
privacy: null,
auth: null,
deep_work_hours: null
};

function coerceString(x: any): string | null {
if (typeof x === "string") return x.trim() || null;
return null;
}
function coerceTone(x: any): Tone | null {
const t = typeof x === "string" ? x.toLowerCase() : "";
if (t === "eli5" || t === "intermediate" || t === "developer") return t as Tone;
return null;
}
function coercePrivacy(x: any): Privacy | null {
if (typeof x !== "string") return null;
const v = x.toLowerCase();
if (v.includes("private")) return "Private";
if (v.includes("share")) return "Share via link";
if (v.includes("public")) return "Public";
return null;
}
function coerceAuth(x: any): Auth | null {
if (typeof x !== "string") return null;
const v = x.toLowerCase();
if (v.includes("google")) return "Google OAuth";
if (v.includes("magic")) return "Magic email link";
if (v.includes("none")) return "None (dev only)";
return null;
}
function coerceDeepHours(x: any): DeepHours | null {
const s = typeof x === "string" ? x : (typeof x === "number" ? String(x) : "");
if (["0.5","1","2","4+"].includes(s)) return s as DeepHours;
return null;
}
function coerceFeatures(x: any): string[] {
if (Array.isArray(x)) return x.map(v => typeof v === "string" ? v : toText(v)).filter(Boolean);
if (typeof x === "string" && x.trim()) return x.split(/[,;]\s*/g).map(s => s.trim()).filter(Boolean);
return [];
}
function coerceExtracted(p?: Partial<Extracted> | null): Extracted {
const src = p ?? {};
return {
tone: coerceTone((src as any).tone) ?? DEFAULT_EXTRACTED.tone,
idea: coerceString((src as any).idea),
name: coerceString((src as any).name),
audience: coerceString((src as any).audience),
features: coerceFeatures((src as any).features),
privacy: coercePrivacy((src as any).privacy),
auth: coerceAuth((src as any).auth),
deep_work_hours: coerceDeepHours((src as any).deep_work_hours)
};
}

/* ──────────────────────────────────────────────────────────────────────────────
ENVELOPE UTILITIES
────────────────────────────────────────────────────────────────────────────── */

function safeEnvelope(partial: Partial<Envelope>): Envelope {
return {
success: partial.success ?? true,
mode: "chat",
session_id: partial.session_id ?? uuid(),
turn_id: partial.turn_id ?? uuid(),
reply_to_user: toText(partial.reply_to_user ?? "OK."),
confidence: partial.confidence ?? "high",
extracted: coerceExtracted(partial.extracted),
status: partial.status ?? { complete: false, missing: [], next_question: null },
suggestions: partial.suggestions ?? [],
error: partial.error ?? { code: null, message: null },
meta: {
conversation_stage: partial.meta?.conversation_stage ?? "planning",
turn_count: partial.meta?.turn_count ?? 0,
schema_version: "1.0",
model: partial.meta?.model,
temperature: partial.meta?.temperature,
usage: partial.meta?.usage,
skip_map: partial.meta?.skip_map ?? {}
},
block: partial.block ?? null
};
}
function normalizeIfEnvelope(obj: Record<string, unknown>): Envelope | null {
const looksLike = "success" in obj || "reply_to_user" in obj || "extracted" in obj;
if (!looksLike) return null;
const coerced = safeEnvelope(obj as Partial<Envelope>);
coerced.reply_to_user = toText(coerced.reply_to_user);
return coerced;
}
function extractHumanTextLike(value: unknown): string {
if (typeof value === "string") {
const trimmed = value.trim();
if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
const maybe = tryJSON(trimmed);
if (maybe) {
const env = normalizeIfEnvelope(maybe);
if (env) return env.reply_to_user;
}
}
return stripFences(value);
}
if (Array.isArray(value)) return value.map(extractHumanTextLike).join("\n").trim();
if (value && typeof value === "object") {
const env = normalizeIfEnvelope(value as Record<string, unknown>);
if (env) return env.reply_to_user;
const candidates = ["reply_to_user","text","message","content","output_text","value"];
for (const k of candidates) {
const v = (value as any)[k];
if (typeof v === "string") return stripFences(v);
}
return toText(value);
}
return toText(value);
}

/* ──────────────────────────────────────────────────────────────────────────────
MEMORY MERGE & MISSING
────────────────────────────────────────────────────────────────────────────── */

const REQUIRED_ORDER: Array<keyof Extracted> = [
"tone", "idea", "audience", "features", "privacy", "auth", "deep_work_hours"
];

function mergeExtracted(memory?: Partial<Extracted> | null, model?: Partial<Extracted> | null): Extracted {
const A = coerceExtracted(memory);
const B = coerceExtracted(model);
return {
tone: B.tone ?? A.tone,
idea: B.idea ?? A.idea,
name: B.name ?? A.name,
audience: B.audience ?? A.audience,
features: [...new Set([...(A.features || []), ...(B.features || [])])],
privacy: B.privacy ?? A.privacy,
auth: B.auth ?? A.auth,
deep_work_hours: B.deep_work_hours ?? A.deep_work_hours
};
}
type MissingKey = keyof Extracted;
function computeMissing(ex: Extracted, skip_map: SkipMap): string[] {
const missing: string[] = [];
for (const key of REQUIRED_ORDER) {
if (skip_map[key]) continue;
const v = (ex as any)[key];
if (key === "features") {
if (!Array.isArray(v) || v.length === 0) missing.push("features");
continue;
}
if (v === null || v === undefined || v === "") missing.push(key);
}
if (ex.tone) {
const i = missing.indexOf("tone");
if (i >= 0) missing.splice(i, 1);
}
return missing;
}

/* ──────────────────────────────────────────────────────────────────────────────
SKIP & NEXT QUESTION
────────────────────────────────────────────────────────────────────────────── */

const QUESTIONS: Record<keyof Extracted, string> = {
tone: "How would you like me to explain things — ELI5, intermediate, or developer?",
idea: "What's your app idea in one short line?",
name: "Do you have a name in mind? If not, we can skip naming.",
audience: "Who's your target audience?",
features: "List 2–3 key features you want first.",
privacy: "Do you want the project to be Private, Share via link, or Public?",
auth: "How should users sign in? Google OAuth, Magic email link, or None (dev only)?",
deep_work_hours: "How many hours can you focus at a time? 0.5, 1, 2, or 4+?"
};

const EXPLANATIONS: Record<string, string> = {
privacy: "Private means only you and your team can see it. Share via link means it's unlisted but anyone with the link can access it. Public means it's visible to everyone.",
auth: "Google OAuth lets users sign in with their Google account. Magic email link sends a passwordless login link. None means no authentication (only for development).",
tone: "ELI5 means I'll explain everything very simply. Intermediate gives some technical detail. Developer assumes you know coding.",
features: "Features are the main things your app will do - like 'user login', 'send messages', or 'upload photos'.",
audience: "Your target audience is who will use your app - like 'busy parents', 'small business owners', or 'college students'.",
deep_work_hours: "This helps me estimate realistic timelines. How long can you focus on building without interruptions?",
idea: "Your app idea should be a short description of what your app does - like 'a todo app for families' or 'a photo sharing app for events'."
};

const ACKNOWLEDGMENTS = ["Got it", "Perfect", "Makes sense", "Great", "Understood", "Nice"];

const SKIPPABLE_FIELDS: Array<keyof Extracted> = ["name", "audience", "features", "privacy", "auth", "deep_work_hours", "tone", "idea"];

const SKIP_PATTERNS: Partial<Record<keyof Extracted, RegExp[]>> = {
name: [/\bno name\b/i, /\bskip (the )?name\b/i, /\bdon'?t need (a )?name\b/i],
audience: [/\bskip audience\b/i, /\bno specific audience\b/i],
features: [/\bskip features\b/i, /\bno features\b/i],
privacy: [/\bskip privacy\b/i],
auth: [/\bskip auth\b/i, /\bno auth\b/i],
deep_work_hours: [/\bskip (deep[-\s]?work|hours)\b/i],
idea: [/\bskip idea\b/i],
tone: [/\bskip tone\b/i]
};

function detectSkipsFromText(userText: string, currentSkip: SkipMap): SkipMap {
const t = (userText || "").toLowerCase();
const updated: SkipMap = { ...currentSkip };
for (const field of SKIPPABLE_FIELDS) {
const patterns = SKIP_PATTERNS[field];
if (!patterns) continue;
for (const re of patterns) { if (re.test(t)) { updated[field] = true; break; } }
}
return updated;
}

function computeNextQuestion(ex: Extracted, skip_map: SkipMap): string | null {
const missing = computeMissing(ex, skip_map);
const nextKey = missing[0] as keyof Extracted | undefined;
if (!nextKey) return null;
return QUESTIONS[nextKey] ?? `Could you share ${String(nextKey).replaceAll("_", " ")}?`;
}

function detectClarificationRequest(userInput: string): boolean {
const lower = userInput.toLowerCase();
const phrases = ["explain", "difference", "what does that mean", "i don't know", "not sure", "what is", "confused", "don't understand"];
return phrases.some(phrase => lower.includes(phrase));
}

function generateServerReply(userInput: string, extracted: Extracted, skipMap: SkipMap, prevMissing: string[]): string {
const missing = computeMissing(extracted, skipMap);
const lastFieldAsked = prevMissing[0];
  
// Handle clarification requests
if (detectClarificationRequest(userInput) && lastFieldAsked && EXPLANATIONS[lastFieldAsked]) {
const explanation = EXPLANATIONS[lastFieldAsked];
const question = QUESTIONS[lastFieldAsked as keyof Extracted];
return `${explanation}\n\n${question}`;
}
  
// If complete
if (missing.length === 0) {
return "Perfect! We have everything we need. I'll now create your project roadmap and PRD.";
}
  
// Get next question
const nextField = missing[0] as keyof Extracted;
const nextQuestion = QUESTIONS[nextField];
  
// Add acknowledgment if user provided info
const hasNewInfo = userInput.trim().length > 10 && !userInput.toLowerCase().includes("help") && !userInput.toLowerCase().includes("ping");
  
if (hasNewInfo && prevMissing.length > missing.length) {
const ack = ACKNOWLEDGMENTS[Math.floor(Math.random() * ACKNOWLEDGMENTS.length)];
return `${ack}! ${nextQuestion}`;
}
  
return nextQuestion;
}

/* ──────────────────────────────────────────────────────────────────────────────
CLARIFICATION HANDLER (no heuristics beyond explicit "explain/difference")
────────────────────────────────────────────────────────────────────────────── */

function isClarify(text: string): boolean {
const t = (text || "").toLowerCase();
return /\b(explain|difference|what('?s| is) the difference|why)\b/.test(t);
}
const EXPLAIN: Partial<Record<keyof Extracted, string>> = {
privacy: [
"• Private: only you/your team can access the project in Lovable.",
"• Share via link: anyone with the link can view/use (no listing).",
"• Public: listed and visible to everyone."
].join("\n"),
auth: [
"• Google OAuth: users sign in with Google (fast, common).",
"• Magic email link: passwordless link sent to email.",
"• None (dev only): no sign-in; good for prototyping, not for sharing."
].join("\n"),
features: "Features are the first capabilities you want. Start with 2–3 that deliver value quickly.",
audience: "Audience describes who your app is for (e.g., your family, photographers, students).",
deep_work_hours: "Deep work hours help plan task sizes. Choose 0.5, 1, 2, or 4+ based on your focus blocks.",
tone: "Tone controls how CP explains things: ELI5 (very simple), intermediate, or developer.",
idea: "The idea is a one-line description of what your app does."
};

/* ──────────────────────────────────────────────────────────────────────────────
REPLY ENFORCER (no question appending; keeps natural feel)
────────────────────────────────────────────────────────────────────────────── */

const FIELD_PATTERNS: Partial<Record<keyof Extracted, RegExp[]>> = {
idea: [/\b(app )?idea\b/i, /\bwhat does it do\b/i, /\bproblem does it solve\b/i],
name: [/\bname(d)?\b/i, /\bcall it\b/i],
audience: [/\baudience\b/i, /\bwho (will|is) (use|using)\b/i, /\bwho is it for\b/i, /\busers?\b/i, /\bfamily\b/i],
features: [/\bfeatures?\b/i, /\bcapabilit(y|ies)\b/i, /\bwhat (do you|does it) need\b/i],
privacy: [/\bprivacy\b/i, /\bpublic\b/i, /\bshare via link\b/i, /\bprivate\b/i],
auth: [/\bauth(entication)?\b/i, /\bsign[- ]?in\b/i, /\blog ?in\b/i, /\boauth\b/i, /\bmagic (email )?link\b/i],
deep_work_hours: [/\bdeep[- ]?work\b/i, /\bhours?\b/i, /\bfocus\b/i]
};
function mentionsKnownOrSkipped(sentence: string, ex: Extracted, skip: SkipMap): boolean {
for (const key of Object.keys(FIELD_PATTERNS) as (keyof Extracted)[]) {
const regs = FIELD_PATTERNS[key] || [];
const known = key === "features" ? (ex.features?.length ?? 0) > 0 : Boolean((ex as any)[key]);
if ((known || skip[key]) && regs.some(re => re.test(sentence))) return true;
}
return false;
}
function enforceReplyText(modelReply: string, ex: Extracted, skip: SkipMap): string {
let text = toText(modelReply).trim();
if (!text) text = "OK.";
const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
const kept = sentences.filter(s => !/[?]\s*$/.test(s)); // drop model questions
const filtered = kept.filter(s => !mentionsKnownOrSkipped(s, ex, skip));
const out = filtered.join(" ").trim();
return out || "OK.";
}

/* ──────────────────────────────────────────────────────────────────────────────
MODEL OUTPUT NORMALIZATION
────────────────────────────────────────────────────────────────────────────── */

function normalizeFromModelContent(contentAny: unknown, session_id: string, turn_id: string, turn_count: number, model: string, temperature: number | undefined, usage?: any): Envelope {
const text = extractHumanTextLike(contentAny) || "OK.";
const env = safeEnvelope({
success: true, mode: "chat", session_id, turn_id, reply_to_user: text,
meta: { conversation_stage: "planning", turn_count, schema_version: "1.0", model, temperature }
});
if (usage) {
const pt = Number(usage.prompt_tokens ?? 0), ct = Number(usage.completion_tokens ?? 0), tt = Number(usage.total_tokens ?? pt + ct);
const price = PRICE_TABLE[model] ?? { in: 0, out: 0 };
const input_usd = (pt / 1000) * price.in, output_usd = (ct / 1000) * price.out, total_usd = input_usd + output_usd;
env.meta.usage = { prompt_tokens: pt, completion_tokens: ct, total_tokens: tt, cost: { input_usd, output_usd, total_usd, currency: "USD" } };
}
return env;
}
function parseAsEnvelope(raw: string): Envelope | null {
const obj = tryJSON(raw);
if (!obj || typeof obj !== "object") return null;
return normalizeIfEnvelope(obj as Record<string, unknown>);
}

/* ──────────────────────────────────────────────────────────────────────────────
HTTP HANDLER
────────────────────────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
const url = new URL(req.url);
if (req.method === "OPTIONS") return withCors(req, "ok", { status: 200, headers: { "Content-Type": "text/plain" } });

if (req.method === "GET" || req.method === "HEAD") {
const body = req.method === "HEAD" ? null : JSON.stringify({ ok: true, fn: "cp-chat", path: url.pathname, time: new Date().toISOString(), version: CP_VERSION });
return withCors(req, body, { status: 200, headers: { "Content-Type": "application/json" } });
}

if (req.method !== "POST") {
return withCors(req, JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } }), { status: 405 });
}

// Parse payload
let payload: ClientPayload; try { payload = await req.json(); } catch { payload = { user_input: "" }; }
const session_id = payload.session_id ?? uuid();
const turn_id = uuid();
const turn_count = payload.turn_count ?? 0;
const userText = (payload.user_input ?? "").toString().slice(0, 8000);

// Memory at the start of the turn (used for server reply generation)
const memoryExtracted = coerceExtracted(payload.memory?.extracted);
const skip_map_initial: SkipMap = { ...(payload.memory?.skip_map ?? {}) };
const prevMissing = computeMissing(memoryExtracted, skip_map_initial);

// Update skip_map with any new skip intent in this user message
let skip_map: SkipMap = detectSkipsFromText(userText, skip_map_initial);

// Health check
if (userText.trim().toLowerCase() === "ping") {
const env = safeEnvelope({
success: true, session_id, turn_id, reply_to_user: "pong",
meta: { conversation_stage: "planning", turn_count, schema_version: "1.0", skip_map }
});
return withCors(req, JSON.stringify(env), { status: 200 });
}

const OPENAI_API_KEY = ENV_OPENAI ?? (DEV_UNSAFE_ALLOW_KEY && payload.openai_api_key ? payload.openai_api_key : undefined);
if (!OPENAI_API_KEY) {
return withCors(req, JSON.stringify(safeEnvelope({
success: false, session_id, turn_id,
reply_to_user: "I can't see an OpenAI API key.",
confidence: "low",
error: { code: "MISSING_OPENAI_KEY", message: "OPENAI_API_KEY not set in Supabase and dev fallback disabled." },
meta: { conversation_stage: "planning", turn_count, schema_version: "1.0", skip_map }
})), { status: 200 });
}

// Pick model & temperature by intent
const intent = detectIntent(userText);
const pick = pickModelAndTemp(intent);
const caps = MODEL_CAPS[pick.model] ?? { supports: { temperature: false, top_p: false } };

// Compose model request for conversational extraction
const messages = [
{ role: "system", content: CONVERSATIONAL_SYSTEM_PROMPT },
{ role: "user", content: JSON.stringify({
session_id, turn_id, user_input: userText,
memory: { extracted: memoryExtracted, skip_map }
})
}
];
const body: Record<string, unknown> = { model: pick.model, messages, response_format: { type: "json_object" } };
if (caps.supports.temperature && typeof pick.temperature === "number") body.temperature = pick.temperature;

try {
const resp = await fetch("https://api.openai.com/v1/chat/completions", {
method: "POST",
headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
body: JSON.stringify(body)
});

const raw = await resp.text();
if (!resp.ok) {
  return withCors(req, JSON.stringify(safeEnvelope({
    success: false, session_id, turn_id,
    reply_to_user: "I had trouble talking to the model.",
    confidence: "low",
    error: { code: "OPENAI_API_ERROR", message: raw },
    meta: { conversation_stage: "planning", turn_count, schema_version: "1.0", model: pick.model, temperature: (body.temperature as number | undefined), skip_map }
  })), { status: 200 });
}

const completion = tryJSON<any>(raw);
const msg = completion?.choices?.[0]?.message;
const contentAny: unknown = msg?.content ?? msg;

// Parse LLM's JSON response
let llmResponse: any = null;
if (typeof contentAny === "string") {
  llmResponse = tryJSON(contentAny);
}

if (!llmResponse || typeof llmResponse !== "object") {
  return withCors(req, JSON.stringify(safeEnvelope({
    success: false, session_id, turn_id,
    reply_to_user: "I had trouble understanding the model response.",
    confidence: "low",
    error: { code: "INVALID_MODEL_RESPONSE", message: "Model did not return valid JSON" },
    meta: { conversation_stage: "planning", turn_count, schema_version: "1.0", model: pick.model, temperature: (body.temperature as number | undefined), skip_map }
  })), { status: 200 });
}

// Extract fields from LLM response
const replyToUser = String(llmResponse.reply_to_user || "Let's continue!");
const modelExtracted = llmResponse.extracted || {};
const mergedExtracted = mergeExtracted(memoryExtracted, modelExtracted);

// Compute final status
const missingNow = computeMissing(mergedExtracted, skip_map);
const nextQ = computeNextQuestion(mergedExtracted, skip_map);

// Final envelope with LLM's natural reply
const env = safeEnvelope({
  session_id,
  turn_id,
  success: true,
  reply_to_user: replyToUser,
  extracted: mergedExtracted,
  status: { complete: missingNow.length === 0, missing: missingNow, next_question: nextQ },
  meta: {
    conversation_stage: missingNow.length === 0 ? "complete" : "planning",
    turn_count,
    schema_version: "1.0",
    model: pick.model,
    temperature: (body.temperature as number | undefined),
    usage: (() => {
      const u = completion?.usage;
      if (!u) return undefined;
      const pt = Number(u.prompt_tokens ?? 0), ct = Number(u.completion_tokens ?? 0), tt = Number(u.total_tokens ?? pt + ct);
      const price = PRICE_TABLE[pick.model] ?? { in: 0, out: 0 };
      const input_usd = (pt / 1000) * price.in, output_usd = (ct / 1000) * price.out, total_usd = input_usd + output_usd;
      return { prompt_tokens: pt, completion_tokens: ct, total_tokens: tt, cost: { input_usd, output_usd, total_usd, currency: "USD" as const } };
    })(),
    skip_map
  }
});

return withCors(req, JSON.stringify(env), { status: 200 });

} catch (err) {
return withCors(req, JSON.stringify(safeEnvelope({
success: false, session_id, turn_id,
reply_to_user: "I had trouble reaching the model.",
confidence: "low",
error: { code: "EDGE_RUNTIME_ERROR", message: String((err as any)?.message ?? err) },
meta: { conversation_stage: "planning", turn_count, schema_version: "1.0", model: pick.model, temperature: (body.temperature as number | undefined), skip_map }
})), { status: 200 });
}
});