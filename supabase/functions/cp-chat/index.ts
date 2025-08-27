/**
	•	CP Edge Function: cp-chat
	•	Version: m3.22-reply-enforcer
	•	
	•	Patch summary:
	•		•	No heuristics added.
	•		•	Enforce that the rendered reply matches the deterministic flow:
	•	• Remove model-asked questions and sentences about known/skipped fields.
	•	• Append exactly one server-picked next_question (if any).
	•		•	Keeps m3.21 deterministic orchestrator intact.
	•	
	•	Notes:
	•		•	No external deps; runs in Supabase Edge (Deno).
	•		•	JSON-only responses; friendly success=false on hard failures.
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
const CP_VERSION = "m3.22-reply-enforcer";

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
SYSTEM PROMPT (kept from your M3 prompt; reminder added re: extraction)
────────────────────────────────────────────────────────────────────────────── */

const SYS_PROMPT = `
You are CP's Prompt Engine, embedded in Lovable.dev. You are a thoughtful senior developer specialized in Lovable. JSON-only.

Goals
	•	Guide founders with a natural conversation.
	•	Extract structured details incrementally.
	•	Always output a single JSON envelope (schema provided separately by the tool).
	•	Support copy-safe Lovable prompts when requested.

Behavior Rules
	•	Warm, natural, adaptive. Not a form.
	•	One clear question per turn.
	•	Before asking, check which fields are missing and never repeat.
	•	Adapt tone (eli5, intermediate, developer).
	•	Lovable-first (no external tooling).
	•	If user updates a field, accept the change.

Extraction Instructions (IMPORTANT)
	•	From each user turn, extract as many fields as you can from: tone, idea, name, audience, features[], privacy, auth, deep_work_hours.
	•	If the user expresses a desire to skip a field (e.g., "skip name"), include a lightweight hint object in your envelope like:
"hint": { "skip": ["name"] }
	•	Do not choose next_question yourself; the server will decide. Focus on accurate extraction and a helpful reply_to_user.
`.trim();

/* ──────────────────────────────────────────────────────────────────────────────
HELPERS (CORS, uuid, JSON, coercion, pricing)
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
  if (typeof x === "string" && x.trim()) {
    // split on commas / semicolons as a convenience
    return x.split(/[,;]\s*/g).map(s => s.trim()).filter(Boolean);
  }
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
  // Model outputs may not be fully compliant; coerce with defaults
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
  if (Array.isArray(value)) {
    const joined = value.map(extractHumanTextLike).join("\n").trim();
    return joined;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const env = normalizeIfEnvelope(obj);
    if (env) return env.reply_to_user;
    const candidates = ["reply_to_user","text","message","content","output_text","value"];
    for (const k of candidates) {
      const v = (obj as any)[k];
      if (typeof v === "string") return stripFences(v);
    }
    return toText(obj);
  }
  return toText(value);
}

/* ──────────────────────────────────────────────────────────────────────────────
MEMORY MERGE (Last-write-wins) & MISSING COMPUTATION
────────────────────────────────────────────────────────────────────────────── */

// Phase-based required order (state machine-lite)
const REQUIRED_ORDER: Array<keyof Extracted> = [
  "tone",            // only missing at very first turn; ignored once set
  "idea",
  "audience",
  "features",
  "privacy",
  "auth",
  "deep_work_hours"
];

function mergeExtracted(memory?: Partial<Extracted> | null, model?: Partial<Extracted> | null): Extracted {
  const A = coerceExtracted(memory);
  const B = coerceExtracted(model);
  // Last write wins: prefer model values when present (non-null, non-empty)
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

function computeMissing(ex: Extracted, skip_map: SkipMap): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_ORDER) {
    if (skip_map[key]) continue; // honored skip
    const v = (ex as any)[key];
    if (key === "features") {
      if (!Array.isArray(v) || v.length === 0) missing.push("features");
      continue;
    }
    if (v === null || v === undefined || v === "") missing.push(key);
  }
  // tone is optional after first set
  if (ex.tone) {
    const i = missing.indexOf("tone");
    if (i >= 0) missing.splice(i, 1);
  }
  return missing;
}

/* ──────────────────────────────────────────────────────────────────────────────
SKIP DETECTION & NEXT QUESTION PICKER (deterministic)
────────────────────────────────────────────────────────────────────────────── */

const FRIENDLY_QUESTION: Record<keyof Extracted, string> = {
  tone: "How would you like me to explain things — ELI5, intermediate, or developer?",
  idea: "What's your app idea in one short line?",
  name: "Do you have a name in mind? If not, we can skip naming.",
  audience: "Who's your target audience?",
  features: "List 2–3 key features you want first.",
  privacy: "Do you want the project to be Private, Share via link, or Public?",
  auth: "How should users sign in? Google OAuth, Magic email link, or None (dev only)?",
  deep_work_hours: "How many hours can you focus at a time? 0.5, 1, 2, or 4+?"
};

const SKIPPABLE_FIELDS: Array<keyof Extracted> = ["name", "audience", "features", "privacy", "auth", "deep_work_hours", "tone", "idea"]; // all can be skipped by user intent, but we only honor for required when appropriate

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
    for (const re of patterns) {
      if (re.test(t)) { updated[field] = true; break; }
    }
  }
  return updated;
}

function computeNextQuestion(ex: Extracted, skip_map: SkipMap): string | null {
  const missing = computeMissing(ex, skip_map);
  const nextKey = missing[0] as keyof Extracted | undefined;
  if (!nextKey) return null;
  return FRIENDLY_QUESTION[nextKey] ?? `Could you share ${String(nextKey).replaceAll("_", " ")}?`;
}

/* ──────────────────────────────────────────────────────────────────────────────
REPLY ENFORCER (no heuristics)
	•	Keep only non-question statements from the model.
	•	Drop statements mentioning fields that are already known or skipped.
	•	Append exactly one deterministic next_question from server.
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

function enforceReplyText(modelReply: string, ex: Extracted, skip: SkipMap, nextQ: string | null): string {
  let text = toText(modelReply).trim();
  if (!text) text = "OK.";

  // Split into sentences; keep only non-questions.
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.filter(s => !/[?]\s*$/.test(s)); // drop any question from model

  // Remove statements that mention fields we already know or have skipped.
  const filtered = kept.filter(s => !mentionsKnownOrSkipped(s, ex, skip));

  // Reassemble and append exactly one deterministic next question (if any).
  let out = filtered.join(" ").trim();
  if (nextQ) out = (out ? out + "\n\n" : "") + nextQ;

  // If everything was filtered and no nextQ, keep a minimal ack.
  if (!out) out = nextQ || "OK.";
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────────
NORMALIZATION OF MODEL OUTPUT → ENVELOPE
(Server decides next_question; model's next_question is ignored)
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
HTTP HANDLER (only the final envelope composition changes to enforce reply)
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

  // Client memory (explicit, per PRD)
  const memoryExtracted = coerceExtracted(payload.memory?.extracted);
  // Start from client-provided skip_map; then detect from current user text
  let skip_map: SkipMap = { ...(payload.memory?.skip_map ?? {}) };
  skip_map = detectSkipsFromText(userText, skip_map);

  // Health endpoint
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

  // Pick model & temperature by intent (capability-aware)
  const intent = detectIntent(userText);
  const pick = pickModelAndTemp(intent);
  const caps = MODEL_CAPS[pick.model] ?? { supports: { temperature: false, top_p: false } };

  // Compose request
  const messages = [
    { role: "system", content: SYS_PROMPT },
    { role: "user", content: JSON.stringify({
      session_id, turn_id, user_input: userText,
      memory: { extracted: memoryExtracted, skip_map }
    })
    }
  ];
  const body: Record<string, unknown> = { model: pick.model, messages, response_format: { type: "json_object" } };
  if (caps.supports.temperature && typeof pick.temperature === "number") body.temperature = pick.temperature;

  // Call model
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

    // Prefer model envelope if present; otherwise fallback to text normalizer
    let modelEnv: Envelope | null = null;
    if (typeof contentAny === "string") modelEnv = parseAsEnvelope(contentAny);
    else if (contentAny && typeof contentAny === "object") modelEnv = normalizeIfEnvelope(contentAny as Record<string, unknown>);

    let env = modelEnv
      ? safeEnvelope(modelEnv)
      : normalizeFromModelContent(contentAny, session_id, turn_id, turn_count, pick.model, body.temperature as number | undefined, completion?.usage);

    // Coerce model's extracted (if any), then merge with memory (last-write-wins on non-arrays; arrays union)
    const modelExtracted = env?.extracted ?? DEFAULT_EXTRACTED;
    const mergedExtracted = mergeExtracted(memoryExtracted, modelExtracted);

  // honor model hint.skip if present
  const hintSkip = (modelEnv as any)?.hint?.skip;
  if (Array.isArray(hintSkip)) {
    for (const k of hintSkip) {
      if ((Object.keys(FRIENDLY_QUESTION) as string[]).includes(k)) skip_map[k as keyof Extracted] = true;
    }
  }

  const missingNow = computeMissing(mergedExtracted, skip_map);
  const nextQ = computeNextQuestion(mergedExtracted, skip_map);

  // ENFORCE reply text to align with deterministic nextQ
  const enforcedReply = enforceReplyText(env.reply_to_user, mergedExtracted, skip_map, nextQ);

  // Final envelope
  env = safeEnvelope({
    ...env,
    session_id,
    turn_id,
    success: true,
    reply_to_user: enforcedReply,
      extracted: mergedExtracted,
      status: { complete: missingNow.length === 0, missing: missingNow, next_question: nextQ },
      meta: {
        conversation_stage: "planning",
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