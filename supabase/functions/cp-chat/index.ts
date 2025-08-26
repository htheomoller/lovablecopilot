/**
 * CP Edge Function: cp-chat
 * Fix: Some models reject non-default temperature → prune it per-model.
 *   • Adds a tiny capability map and only sends params models support.
 *   • Keeps robust CORS, GET ping, and rescue parser.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const CP_MODEL_DEFAULT = Deno.env.get("CP_MODEL_DEFAULT") ?? "gpt-5";
const CP_MODEL_MINI = Deno.env.get("CP_MODEL_MINI") ?? "gpt-4.1-mini";

// —– Capability map —–
// If a model requires default sampling, mark supports.temperature=false.
const MODEL_CAPS: Record<string, { supports: { temperature: boolean; top_p: boolean } }> = {
  "gpt-5": { supports: { temperature: false, top_p: false } },
  "gpt-4.1-mini": { supports: { temperature: true, top_p: true } }
};

// Intent detection (very light)
function detectIntent(text: string): "generate_code" | "brainstorm" | "chat" {
  const t = (text || "").toLowerCase();
  if (t.includes("code") || t.includes("patch") || t.includes("prompt")) return "generate_code";
  if (t.includes("idea") || t.includes("brainstorm") || t.includes("name")) return "brainstorm";
  return "chat";
}

// Route model + (desired) temperature; we will prune unsupported later.
function pickModelAndTemp(intent: "generate_code" | "brainstorm" | "chat") {
  if (intent === "generate_code") return { model: CP_MODEL_DEFAULT, temperature: 0.2 };
  if (intent === "brainstorm") return { model: CP_MODEL_MINI, temperature: 0.8 };
  return { model: CP_MODEL_MINI, temperature: 0.3 };
}

// —– CORS helpers —–
function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  const reqHdrs = req.headers.get("Access-Control-Request-Headers") ?? "authorization, apikey, content-type, x-client-info, x-cp-client";
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  h.set("Access-Control-Allow-Headers", reqHdrs);
  return h;
}
function withCors(req: Request, body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers || {});
  buildCorsHeaders(req).forEach((v, k) => headers.set(k, v));
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(body, { ...init, headers });
}

// —– utils —–

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

type ClientPayload = { session_id?: string; turn_count?: number; user_input: string };

const SYS_PROMPT = `You are CP, a senior developer companion specialized in Lovable projects. CRITICAL: Return ONLY valid JSON matching the envelope schema. No prose outside the JSON object. If you cannot comply, return an error envelope.`.trim();

function tryRescueParse(content: string): any | null {
  try { return JSON.parse(content); } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = content.slice(start, end + 1);
      try { return JSON.parse(slice); } catch { /* fallthrough */ }
    }
    return null;
  }
}

// —– handler —–
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Preflight
  if (req.method === "OPTIONS") {
    return withCors(req, "ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // Health/ping
  if (req.method === "GET" || req.method === "HEAD") {
    const body = req.method === "HEAD" ? null : JSON.stringify({ ok: true, fn: "cp-chat", path: url.pathname, time: new Date().toISOString() });
    return withCors(req, body, { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return withCors(req, JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } }), { status: 405 });
  }
  if (!OPENAI_API_KEY) {
    return withCors(req, JSON.stringify({ error: { code: "MISSING_OPENAI_KEY", message: "OPENAI_API_KEY not set" } }), { status: 500 });
  }

  let payload: ClientPayload;
  try { payload = await req.json(); } catch { payload = { user_input: "" }; }

  const session_id = payload.session_id ?? uuid();
  const turn_id = uuid();
  const userText = (payload.user_input ?? "").toString().slice(0, 8000);

  // Choose model & desired temp by intent, then prune unsupported
  const intent = detectIntent(userText);
  const pick = pickModelAndTemp(intent);
  const caps = MODEL_CAPS[pick.model] ?? { supports: { temperature: false, top_p: false } };

  const messages = [
    { role: "system", content: SYS_PROMPT },
    { role: "user", content: JSON.stringify({ session_id, turn_id, user_input: userText }) }
  ];

  // Build request body, conditionally adding temperature/top_p
  const body: Record<string, unknown> = {
    model: pick.model,
    messages,
    response_format: { type: "json_object" }
  };
  if (caps.supports.temperature) body.temperature = pick.temperature;
  // We currently avoid top_p for safety unless you flip the cap on a given model.

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    const parsed = tryRescueParse(text);
    if (!resp.ok || !parsed) {
      return withCors(req, JSON.stringify({
        success: false,
        mode: "chat",
        session_id, turn_id,
        reply_to_user: "I had trouble processing the model reply.",
        confidence: "low",
        error: { code: "INVALID_JSON_OR_OPENAI_ERROR", message: text }
      }), { status: 200 });
    }
    return withCors(req, JSON.stringify(parsed), { status: 200 });
  } catch (err) {
    return withCors(req, JSON.stringify({
      success: false,
      mode: "chat",
      session_id, turn_id,
      reply_to_user: "I had trouble reaching the model.",
      confidence: "low",
      error: { code: "EDGE_RUNTIME_ERROR", message: String(err?.message ?? err) }
    }), { status: 200 });
  }
});