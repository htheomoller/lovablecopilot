/**
 * CP Edge Function: cp-chat
 * Patch: Replace SYS_PROMPT with hardened M3 System Prompt (with success=false examples).
 * Version: m3.17-m3-sysprompt
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ENV_OPENAI = Deno.env.get("OPENAI_API_KEY");
const DEV_UNSAFE_ALLOW_KEY = (Deno.env.get("DEV_UNSAFE_ALLOW_KEY") ?? "false").toLowerCase() === "true";
const CP_MODEL_DEFAULT = Deno.env.get("CP_MODEL_DEFAULT") ?? "gpt-5";
const CP_MODEL_MINI = Deno.env.get("CP_MODEL_MINI") ?? "gpt-4.1-mini";
const CP_VERSION = "m3.17-m3-sysprompt";

const MODEL_CAPS: Record<string, { supports: { temperature: boolean; top_p: boolean } }> = {
  "gpt-5": { supports: { temperature: false, top_p: false } },
  "gpt-4.1-mini": { supports: { temperature: true, top_p: true } }
};

function detectIntent(text: string): "generate_code" | "brainstorm" | "chat" {
  const t = (text || "").toLowerCase();
  if (t.includes("code") || t.includes("patch") || t.includes("prompt")) return "generate_code";
  if (t.includes("idea") || t.includes("brainstorm") || t.includes("name")) return "brainstorm";
  return "chat";
}
function pickModelAndTemp(intent: "generate_code" | "brainstorm" | "chat") {
  if (intent === "generate_code") return { model: CP_MODEL_DEFAULT, temperature: 0.2 };
  if (intent === "brainstorm") return { model: CP_MODEL_MINI, temperature: 0.8 };
  return { model: CP_MODEL_MINI, temperature: 0.3 };
}

// — CORS —
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

// — utils —
function uuid(): string {
  // deno-lint-ignore no-explicit-any
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
function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return stripFences(v);
  try {
    const s = JSON.stringify(v);
    return s.length <= 200 ? s : JSON.stringify(v, null, 2);
  } catch { return String(v); }
}

// –– Envelope helpers ––
type Envelope = {
  success: boolean; mode: "chat"; session_id: string; turn_id: string;
  reply_to_user: string; confidence: "high" | "medium" | "low";
  extracted: { tone: "eli5" | "intermediate" | "developer" | null; idea: string | null; name: string | null; audience: string | null; features: string[]; privacy: "Private" | "Share via link" | "Public" | null; auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null; deep_work_hours: "0.5" | "1" | "2" | "4+" | null; };
  status: { complete: boolean; missing: string[]; next_question: string | null };
  suggestions: string[];
  error: { code: string | null; message: string | null };
  meta: { conversation_stage: "discovery" | "planning" | "generating" | "refining"; turn_count: number; schema_version: string };
  block: { language: "lovable-prompt" | "ts" | "js" | "json" | null; content: string | null; copy_safe: boolean } | null;
};
type ClientPayload = { session_id?: string; turn_count?: number; user_input: string; openai_api_key?: string };

function safeEnvelope(partial: Partial<Envelope>): Envelope {
  return {
    success: partial.success ?? true,
    mode: "chat",
    session_id: partial.session_id ?? uuid(),
    turn_id: partial.turn_id ?? uuid(),
    reply_to_user: toText(partial.reply_to_user ?? "OK."),
    confidence: partial.confidence ?? "high",
    extracted: partial.extracted ?? { tone: "developer", idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null },
    status: partial.status ?? { complete: false, missing: [], next_question: null },
    suggestions: partial.suggestions ?? [],
    error: partial.error ?? { code: null, message: null },
    meta: partial.meta ?? { conversation_stage: "planning", turn_count: 0, schema_version: "1.0" },
    block: partial.block ?? null
  };
}

function normalizeIfEnvelope(obj: Record<string, unknown>): Envelope | null {
  const looksLike = "reply_to_user" in obj || "success" in obj;
  if (!looksLike) return null;
  const env = safeEnvelope(obj as Partial<Envelope>);
  env.reply_to_user = toText(env.reply_to_user);
  return env;
}

/** NEW: pull a readable string out of a response value that can be string or object */
function extractFromResponseValue(v: unknown): string | "" {
  if (typeof v === "string") return toText(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    // common subkeys that carry the text
    const sub = o.text ?? (o as any).message ?? (o as any).content ?? (o as any).output_text ?? (o as any).value;
    if (typeof sub === "string") return toText(sub);
    // arrays inside response: join
    for (const key of ["parts", "outputs", "items"]) {
      const arr = (o as any)[key];
      if (Array.isArray(arr)) {
        const joined = arr.map(extractHumanTextLike).join("\n").trim();
        if (joined) return joined;
      }
    }
    // final stringify
    return toText(o);
  }
  return "";
}

/** Universal extractor: now prioritizes response and unwraps JSON-looking strings. */
function extractHumanTextLike(value: unknown): string {
  // Strings
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      const maybe = tryJSON(trimmed);
      if (maybe) return extractHumanTextLike(maybe);
    }
    return toText(value);
  }

  // Arrays
  if (Array.isArray(value)) {
    const parts = value.map(extractHumanTextLike).filter(Boolean);
    const joined = parts.join("\n").trim();
    if (joined) return joined;
    return "";
  }

  // Objects
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // Envelope passthrough
    const env = normalizeIfEnvelope(obj);
    if (env) return env.reply_to_user;

    // 1) TOP PRIORITY: `response`
    if ("response" in obj) {
      const txt = extractFromResponseValue((obj as any).response);
      if (txt) return txt;
    }

    // 2) Direct simple keys
    const priority = ["reply_to_user", "text", "message", "content", "output_text", "value"];
    for (const k of priority) {
      const v = obj[k];
      if (typeof v === "string" && v) return toText(v);
    }

    // 3) Containers
    const containers = ["parts", "outputs", "choices", "data", "messages", "items"];
    for (const k of containers) {
      const v = (obj as any)[k];
      if (Array.isArray(v)) {
        const joined = v.map(extractHumanTextLike).join("\n").trim();
        if (joined) return joined;
      }
    }

    // 4) Single-string-field shortcut
    const stringFields = Object.entries(obj).filter(([, v]) => typeof v === "string") as Array<[string, string]>;
    if (stringFields.length === 1) return toText(stringFields[0][1]);

    // 5) Last resort
    return toText(obj);
  }

  return toText(value);
}


/** Normalize any model-produced content into our envelope. */
function normalizeFromModelContent(contentAny: unknown, session_id: string, turn_id: string, turn_count: number): Envelope {
  let text = extractHumanTextLike(contentAny);

  // If result still looks like JSON, unwrap once more
  const trimmed = text.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    const parsed = tryJSON(trimmed);
    if (parsed && typeof parsed === "object") {
      const inner = extractHumanTextLike(parsed);
      if (inner && inner !== text) text = inner;
    }
  }

  return safeEnvelope({
    success: true,
    mode: "chat",
    session_id, turn_id,
    reply_to_user: text,
    meta: { conversation_stage: "planning", turn_count }
  });
}

const SYS_PROMPT = `
You are CP's Prompt Engine, a conversational assistant embedded in Lovable.dev.
Your role is to behave like a thoughtful senior developer specialized in Lovable.

⸻
Goals

1. Guide founders through a natural onboarding conversation.
2. Extract structured project details incrementally.
3. Output everything in a strict JSON envelope (defined below).
4. Support copy-safe Lovable prompts when requested.
5. Never overwhelm or confuse the user.

⸻
Rules of Behavior

* Be warm, natural, and adaptive. Do not sound like a form.
* Before asking a question, always check which fields are missing. Never repeat questions that are already answered.
* Ask one clear question per turn.
* Adapt tone to the user's coding knowledge:
  * "Explain like I'm 5" → extremely simple.
  * "Intermediate" → some technical detail.
  * "Developer" → detailed, precise.
* If the user changes their mind (e.g., updates the name), confirm the change and update the field.
* If the user asks "What can you do?", explain CP's scope:
  * Onboarding → PRDs → roadmap integration
  * Code health monitoring + guardrails
  * Versioning, retriever, safety net
* Always Lovable-first (no external tooling).

⸻
JSON Envelope Spec
Always return only one JSON object like this:

{
  "success": true,
  "mode": "chat",
  "session_id": "<uuid>",
  "turn_id": "<uuid>",
  "reply_to_user": "Conversational message for the user, plain text only.",
  "confidence": "high | medium | low",
  "extracted": {
    "tone": "eli5 | intermediate | developer | null",
    "idea": "string or null",
    "name": "string or null",
    "audience": "string or null",
    "features": ["string", "..."],
    "privacy": "Private | Share via link | Public | null",
    "auth": "Google OAuth | Magic email link | None (dev only) | null",
    "deep_work_hours": "0.5 | 1 | 2 | 4+ | null"
  },
  "status": {
    "complete": false,
    "missing": ["idea","name","audience", "..."],
    "next_question": "One friendly question or null"
  },
  "suggestions": ["short reply option 1","short reply option 2"],
  "error": { "code": null, "message": null },
  "meta": {
    "conversation_stage": "discovery | planning | generating | refining",
    "turn_count": 1,
    "schema_version": "1.0"
  },
  "block": {
    "language": "lovable-prompt | ts | js | json",
    "content": "",
    "copy_safe": true
  }
}

⸻
Hardening Rules

1. JSON only. Never output text outside the JSON.
2. One-turn = one question.
3. No duplicates: don't ask for fields already filled.
4. If success=false, populate error with code + message.
5. status.complete=true only when all required fields are filled.
6. block.content is used only when generating a Lovable prompt or code.
7. Keep everything copy-safe (no backticks or markdown fences inside content).

⸻
Few-Shot Examples

✅ Good Example (first turn, tone chosen)
{
  "success": true,
  "mode": "chat",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "turn_id": "111e4567-e89b-12d3-a456-426614174000",
  "reply_to_user": "Got it — I'll keep things super simple. What's your app idea in one short line?",
  "confidence": "high",
  "extracted": {
    "tone": "eli5",
    "idea": null,
    "name": null,
    "audience": null,
    "features": [],
    "privacy": null,
    "auth": null,
    "deep_work_hours": null
  },
  "status": {
    "complete": false,
    "missing": ["idea","name","audience","features","privacy","auth","deep_work_hours"],
    "next_question": "What's your app idea in one short line?"
  },
  "suggestions": ["Photo app","Fitness app","Social app"],
  "error": { "code": null, "message": null },
  "meta": { "conversation_stage": "discovery", "turn_count": 1, "schema_version": "1.0" },
  "block": { "language": "lovable-prompt", "content": "", "copy_safe": true }
}

✅ Good Example (user changes name mid-way)
{
  "success": true,
  "mode": "chat",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "turn_id": "222e4567-e89b-12d3-a456-426614174000",
  "reply_to_user": "Got it — you'd like to change the name to 'PhotoFix'. I've updated it. Who's your target audience?",
  "confidence": "high",
  "extracted": {
    "tone": "eli5",
    "idea": "An app that restores old photos",
    "name": "PhotoFix",
    "audience": null,
    "features": ["AI restoration"],
    "privacy": null,
    "auth": null,
    "deep_work_hours": null
  },
  "status": {
    "complete": false,
    "missing": ["audience","privacy","auth","deep_work_hours"],
    "next_question": "Who's your target audience?"
  },
  "suggestions": ["Families","Photographers","Everyone"],
  "error": { "code": null, "message": null },
  "meta": { "conversation_stage": "discovery", "turn_count": 2, "schema_version": "1.0" },
  "block": { "language": "lovable-prompt", "content": "", "copy_safe": true }
}

❌ Bad Example (repeats a filled field, multiple questions)
{
  "success": true,
  "mode": "chat",
  "reply_to_user": "What's your app idea? Also, who's your target audience?",
  "extracted": {
    "tone": "eli5",
    "idea": "Photo restoration app"
  },
  "status": {
    "missing": ["audience"],
    "next_question": "What's your app idea? Who's your audience?"
  }
}
Why bad?
* Asks for idea again (already known).
* Multiple questions in one turn.
* Envelope is incomplete (missing fields, meta, etc.).

⸻
❌ Error Example (malformed user input)
{
  "success": false,
  "mode": "chat",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "turn_id": "333e4567-e89b-12d3-a456-426614174000",
  "reply_to_user": "I had trouble processing that. Please rephrase.",
  "confidence": "low",
  "extracted": {
    "tone": null,
    "idea": null,
    "name": null,
    "audience": null,
    "features": [],
    "privacy": null,
    "auth": null,
    "deep_work_hours": null
  },
  "status": {
    "complete": false,
    "missing": ["idea","name","audience","features","privacy","auth","deep_work_hours"],
    "next_question": null
  },
  "suggestions": ["Try again","Rephrase","Give an example"],
  "error": { "code": "INVALID_INPUT", "message": "Could not parse user input" },
  "meta": { "conversation_stage": "discovery", "turn_count": 3, "schema_version": "1.0" },
  "block": { "language": "lovable-prompt", "content": "", "copy_safe": true }
}

❌ Error Example (unsupported request)
{
  "success": false,
  "mode": "chat",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "turn_id": "444e4567-e89b-12d3-a456-426614174000",
  "reply_to_user": "Sorry, I can't help with that request.",
  "confidence": "low",
  "extracted": {
    "tone": null,
    "idea": null,
    "name": null,
    "audience": null,
    "features": [],
    "privacy": null,
    "auth": null,
    "deep_work_hours": null
  },
  "status": {
    "complete": false,
    "missing": ["idea","name","audience","features","privacy","auth","deep_work_hours"],
    "next_question": null
  },
  "suggestions": [],
  "error": { "code": "UNSUPPORTED", "message": "This request is outside CP's scope" },
  "meta": { "conversation_stage": "discovery", "turn_count": 4, "schema_version": "1.0" },
  "block": { "language": "lovable-prompt", "content": "", "copy_safe": true }
}
`.trim();

// —– handler —–
Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return withCors(req, "ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  if (req.method === "GET" || req.method === "HEAD") {
    const body = req.method === "HEAD" ? null : JSON.stringify({ ok: true, fn: "cp-chat", path: url.pathname, time: new Date().toISOString(), version: CP_VERSION });
    return withCors(req, body, { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") return withCors(req, JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } }), { status: 405 });

  let payload: ClientPayload; try { payload = await req.json(); } catch { payload = { user_input: "" }; }
  const session_id = payload.session_id ?? uuid();
  const turn_id = uuid();
  const turn_count = payload.turn_count ?? 0;
  const userText = (payload.user_input ?? "").toString().slice(0, 8000);

  // Short-circuit ping
  if (userText.trim().toLowerCase() === "ping") {
    return withCors(req, JSON.stringify(safeEnvelope({ success: true, session_id, turn_id, reply_to_user: "pong", meta: { conversation_stage: "planning", turn_count } })), { status: 200 });
  }

  // Resolve key: prefer env; optionally allow dev fallback
  const OPENAI_API_KEY =
    ENV_OPENAI ??
    (DEV_UNSAFE_ALLOW_KEY && payload.openai_api_key ? payload.openai_api_key : undefined);

  if (!OPENAI_API_KEY) {
    return withCors(req, JSON.stringify(safeEnvelope({
      success: false,
      session_id, turn_id,
      reply_to_user: "I can't see an OpenAI API key.",
      confidence: "low",
      error: { code: "MISSING_OPENAI_KEY", message: "OPENAI_API_KEY not set in Supabase and dev fallback disabled." },
      meta: { conversation_stage: "planning", turn_count }
    })), { status: 200 });
  }

  const intent = detectIntent(userText);
  const pick = pickModelAndTemp(intent);
  const caps = MODEL_CAPS[pick.model] ?? { supports: { temperature: false, top_p: false } };

  const messages = [
    { role: "system", content: SYS_PROMPT },
    { role: "user", content: JSON.stringify({ session_id, turn_id, user_input: userText }) }
  ];

  const body: Record<string, unknown> = { model: pick.model, messages, response_format: { type: "json_object" } };
  if (caps.supports.temperature) body.temperature = pick.temperature;

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
        meta: { conversation_stage: "planning", turn_count }
      })), { status: 200 });
    }
    // Support classic and structured responses
    const completion = tryJSON<any>(raw);
    const msg = completion?.choices?.[0]?.message;
    let contentAny: unknown = msg?.content;
    if (contentAny === undefined && msg && typeof msg === "object") {
      contentAny = (msg as any).text ?? (msg as any).content ?? (msg as any).message;
    }
    if (contentAny === undefined) contentAny = msg ?? raw;

    const envelope = normalizeFromModelContent(contentAny, session_id, turn_id, turn_count);
    return withCors(req, JSON.stringify(envelope), { status: 200 });
  } catch (err) {
    return withCors(req, JSON.stringify(safeEnvelope({
      success: false, session_id, turn_id,
      reply_to_user: "I had trouble reaching the model.",
      confidence: "low",
      error: { code: "EDGE_RUNTIME_ERROR", message: String(err?.message ?? err) },
      meta: { conversation_stage: "planning", turn_count }
    })), { status: 200 });
  }
});