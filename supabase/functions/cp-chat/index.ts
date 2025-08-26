/**
 * CP Edge Function: cp-chat
 * Dev fallback for missing Supabase secrets + /health/secrets endpoint.
 *   • If OPENAI_API_KEY missing and DEV_UNSAFE_ALLOW_KEY=true, allow passing openai_api_key in body (dev only).
 *   • Adds GET /health/secrets to check whether the function sees the key.
 * NOTE: Remove DEV_UNSAFE_ALLOW_KEY in prod. This is for unblocking development only.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ENV_OPENAI = Deno.env.get("OPENAI_API_KEY");
const DEV_UNSAFE_ALLOW_KEY = (Deno.env.get("DEV_UNSAFE_ALLOW_KEY") ?? "false").toLowerCase() === "true";
const CP_MODEL_DEFAULT = Deno.env.get("CP_MODEL_DEFAULT") ?? "gpt-5";
const CP_MODEL_MINI = Deno.env.get("CP_MODEL_MINI") ?? "gpt-4.1-mini";
const CP_VERSION = "m3.8-dev-fallback";

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

type Envelope = {
  success: boolean;
  mode: "chat";
  session_id: string;
  turn_id: string;
  reply_to_user: string;
  confidence: "high" | "medium" | "low";
  extracted: {
    tone: "eli5" | "intermediate" | "developer" | null;
    idea: string | null;
    name: string | null;
    audience: string | null;
    features: string[];
    privacy: "Private" | "Share via link" | "Public" | null;
    auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
    deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
  };
  status: { complete: boolean; missing: string[]; next_question: string | null };
  suggestions: string[];
  error: { code: string | null; message: string | null };
  meta: { conversation_stage: "discovery" | "planning" | "generating" | "refining"; turn_count: number };
  block: { language: "lovable-prompt" | "ts" | "js" | "json" | null; content: string | null; copy_safe: boolean } | null;
};

type ClientPayload = { session_id?: string; turn_count?: number; user_input: string; openai_api_key?: string };

const SYS_PROMPT = `You are CP, a senior developer companion specialized in Lovable projects. CRITICAL: Return ONLY valid JSON matching the envelope schema. No prose outside the JSON object. If you cannot comply, return an error envelope.`.trim();

function tryJSON<T = any>(s: string): T | null { try { return JSON.parse(s) as T; } catch { return null; } }
function safeEnvelope(partial: Partial<Envelope>): Envelope {
  return {
    success: partial.success ?? true,
    mode: "chat",
    session_id: partial.session_id ?? uuid(),
    turn_id: partial.turn_id ?? uuid(),
    reply_to_user: (partial.reply_to_user ?? "OK.").replace(/```/g, ""),
    confidence: partial.confidence ?? "high",
    extracted: partial.extracted ?? { tone: "developer", idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null },
    status: partial.status ?? { complete: false, missing: [], next_question: null },
    suggestions: partial.suggestions ?? [],
    error: partial.error ?? { code: null, message: null },
    meta: partial.meta ?? { conversation_stage: "planning", turn_count: 0 },
    block: partial.block ?? null
  };
}

function normalizeFromModel(content: string, session_id: string, turn_id: string, turn_count: number): Envelope {
  const parsed = tryJSON(content);
  if (parsed && typeof parsed === "object" && ("reply_to_user" in parsed || "success" in parsed)) {
    return safeEnvelope({
      ...parsed,
      session_id: parsed.session_id ?? session_id,
      turn_id: parsed.turn_id ?? turn_id,
      meta: parsed.meta ?? { conversation_stage: "planning", turn_count }
    });
  }
  const reply = (parsed && (parsed.response || parsed.reply || parsed.message)) || content;
  return safeEnvelope({
    session_id, turn_id,
    reply_to_user: String(reply),
    meta: { conversation_stage: "planning", turn_count }
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return withCors(req, "ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  
  if (req.method === "GET" || req.method === "HEAD") {
    // Health/secrets endpoint
    if (url.pathname.endsWith("/health/secrets")) {
      const body = req.method === "HEAD" ? null : JSON.stringify({ 
        has_key: !!ENV_OPENAI, 
        dev_fallback_enabled: DEV_UNSAFE_ALLOW_KEY,
        version: CP_VERSION 
      });
      return withCors(req, body, { status: 200, headers: { "Content-Type": "application/json" } });
    }
    
    // Regular health check
    const body = req.method === "HEAD" ? null : JSON.stringify({ 
      ok: true, 
      fn: "cp-chat", 
      path: url.pathname, 
      time: new Date().toISOString(), 
      version: CP_VERSION 
    });
    return withCors(req, body, { status: 200, headers: { "Content-Type": "application/json" } });
  }
  
  if (req.method !== "POST") return withCors(req, JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } }), { status: 405 });

  let payload: ClientPayload; 
  try { payload = await req.json(); } catch { payload = { user_input: "" }; }

  const session_id = payload.session_id ?? uuid();
  const turn_id = uuid();
  const turn_count = payload.turn_count ?? 0;
  const userText = (payload.user_input ?? "").toString().slice(0, 8000);

  // Short-circuit PING for deterministic verification
  if (userText.trim().toLowerCase() === "ping") {
    const env = safeEnvelope({
      success: true,
      session_id, turn_id,
      reply_to_user: "pong",
      meta: { conversation_stage: "planning", turn_count }
    });
    return withCors(req, JSON.stringify(env), { status: 200 });
  }

  // Determine OpenAI key (env or dev fallback)
  let openaiKey = ENV_OPENAI;
  if (!openaiKey && DEV_UNSAFE_ALLOW_KEY && payload.openai_api_key) {
    openaiKey = payload.openai_api_key;
  }

  if (!openaiKey) {
    return withCors(req, JSON.stringify(safeEnvelope({
      success: false,
      session_id, turn_id,
      reply_to_user: "OpenAI API key not available. Check secrets or provide key in dev mode.",
      confidence: "low",
      error: { code: "MISSING_OPENAI_KEY", message: "OPENAI_API_KEY not set and no dev fallback provided" },
      meta: { conversation_stage: "planning", turn_count }
    })), { status: 500 });
  }

  const intent = detectIntent(userText);
  const pick = pickModelAndTemp(intent);
  const caps = MODEL_CAPS[pick.model] ?? { supports: { temperature: false, top_p: false } };

  const messages = [
    { role: "system", content: SYS_PROMPT },
    { role: "user", content: JSON.stringify({ session_id, turn_id, user_input: userText }) }
  ];

  const body: Record<string, unknown> = {
    model: pick.model,
    messages,
    response_format: { type: "json_object" }
  };
  if (caps.supports.temperature) body.temperature = pick.temperature;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return withCors(req, JSON.stringify(safeEnvelope({
        success: false,
        session_id, turn_id,
        reply_to_user: "I had trouble talking to the model.",
        confidence: "low",
        error: { code: "OPENAI_API_ERROR", message: raw },
        meta: { conversation_stage: "planning", turn_count }
      })), { status: 200 });
    }

    const completion = tryJSON<any>(raw);
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.length) {
      return withCors(req, JSON.stringify(safeEnvelope({
        success: false,
        session_id, turn_id,
        reply_to_user: "Model returned an empty message.",
        confidence: "low",
        error: { code: "EMPTY_CONTENT", message: raw },
        meta: { conversation_stage: "planning", turn_count }
      })), { status: 200 });
    }

    const envelope = normalizeFromModel(content, session_id, turn_id, turn_count);
    return withCors(req, JSON.stringify(envelope), { status: 200 });

  } catch (err) {
    return withCors(req, JSON.stringify(safeEnvelope({
      success: false,
      session_id, turn_id,
      reply_to_user: "I had trouble reaching the model.",
      confidence: "low",
      error: { code: "EDGE_RUNTIME_ERROR", message: String(err?.message ?? err) },
      meta: { conversation_stage: "planning", turn_count }
    })), { status: 200 });
  }
});