/**
 * CP Edge Function: cp-chat
 * CORS FIX: handle OPTIONS preflight and attach CORS headers to every response.
 * Also keeps the stronger JSON enforcement + rescue parser.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// — CORS helpers —
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function withCors(body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers || {});
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(body, { ...init, headers });
}

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

const SYS_PROMPT = `You are CP, a senior developer companion specialized in Lovable projects. !! CRITICAL INSTRUCTION !! Return ONLY valid JSON that matches the envelope schema. Do not include any prose outside the JSON object. If you cannot comply, return an error envelope.`.trim();

function tryRescueParse(content: string): any | null {
  try {
    return JSON.parse(content);
  } catch {
    // Attempt to extract first {…} block
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = content.slice(start, end + 1);
      try { return JSON.parse(slice); } catch { return null; }
    }
    return null;
  }
}

Deno.serve(async (req) => {
  // — Handle CORS preflight —
  if (req.method === "OPTIONS") {
    return withCors("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (req.method !== "POST") {
    return withCors(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } }), { status: 405 });
  }
  if (!OPENAI_API_KEY) {
    return withCors(JSON.stringify({ error: { code: "MISSING_OPENAI_KEY", message: "OPENAI_API_KEY not set" } }), { status: 500 });
  }

  let payload: ClientPayload;
  try { payload = await req.json(); } catch { payload = { user_input: "" }; }

  const session_id = payload.session_id ?? uuid();
  const turn_id = uuid();
  const userText = (payload.user_input ?? "").toString().slice(0, 8000);

  const messages = [
    { role: "system", content: SYS_PROMPT },
    { role: "user", content: JSON.stringify({ session_id, turn_id, user_input: userText }) }
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5",
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });
    const text = await resp.text();
    let parsed = tryRescueParse(text);
    if (!resp.ok || !parsed) {
      return withCors(JSON.stringify({
        success: false,
        mode: "chat",
        session_id, turn_id,
        reply_to_user: "I had trouble processing the model reply.",
        confidence: "low",
        error: { code: "INVALID_JSON", message: text }
      }), { status: 200 });
    }
    return withCors(JSON.stringify(parsed), { status: 200 });
  } catch (err) {
    return withCors(JSON.stringify({
      success: false,
      mode: "chat",
      session_id, turn_id,
      reply_to_user: "I had trouble reaching the model.",
      confidence: "low",
      error: { code: "EDGE_RUNTIME_ERROR", message: String(err?.message ?? err) }
    }), { status: 200 });
  }
});