/**
 * Supabase Edge Function: ai-generate
 * Modes:
 *  - ping   → { success:true, mode:"ping", reply:"pong" }
 *  - chat   → calls OpenAI and returns { success:true, mode:"chat", reply, raw }
 *  - nlu    → returns structured JSON for onboarding (LLM-only, no heuristics)
 *
 * Always returns JSON. Handles CORS + bad content-types safely.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}), ...corsHeaders },
  });
}

type ChatPayload = {
  mode?: "ping" | "chat" | "nlu";
  prompt?: string;
  context?: {
    level?: "ELI5" | "Intermediate" | "Developer";
    answers?: Record<string, unknown>;
    transcript?: Array<{ role: "user" | "assistant"; content: string }>;
  };
};

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL_CHAT = Deno.env.get("OPENAI_MODEL_CHAT") ?? "gpt-4o-mini";
const MODEL_NLU  = Deno.env.get("OPENAI_MODEL_NLU")  ?? "gpt-4o-mini";

async function callOpenAIChat(
  userText: string,
  systemPrompt: string,
  transcript: Array<{ role: "user"|"assistant"; content: string }> = [],
  model = MODEL_CHAT,
) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...transcript,
    { role: "user", content: userText ?? "" },
  ];

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 400,
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${r.status}: ${text}`);
  }
  const data = await r.json();
  const reply = data?.choices?.[0]?.message?.content ?? "";
  return { reply, raw: data };
}

// JSON (nlu) extractor – **no heuristics**, the LLM returns JSON we parse
async function callOpenAINLU(userText: string, level: string, prior: Record<string,unknown> = {}) {
  const system = `You are an onboarding assistant for a product builder. 
Return ONLY strict JSON that conforms to this schema:
{
  "summary": string,                      // one sentence reflection of what user said (plain text)
  "fields": {                             // only include keys you are confident about
    "idea"?: string,
    "name"?: string,
    "audience"?: string,
    "features"?: string[],                // short slugs or short phrases
    "privacy"?: "Private" | "Share via link" | "Public",
    "auth"?: "Google OAuth" | "Magic email link" | "None (dev only)",
    "level"?: "ELI5" | "Intermediate" | "Developer"
  },
  "follow_up": string                     // one friendly follow-up question to advance onboarding
}
Guidelines:
- If the user says things like "I don't know" or "you pick", DO NOT set "name". Ask first in follow_up.
- If the user asks for a suggestion, include a project-related name suggestion inside "summary" but DO NOT set the "name" field unless they accept it.
- Infer level from context if they ask for simple explanations: set level = "ELI5".
- Be robust to frustration or corrections. Summarize briefly and ask a helpful follow-up.`;

  const messages = [
    { role: "system", content: system },
    { role: "user", content: `Reading level: ${level}. Prior (optional JSON): ${JSON.stringify(prior)}. User said: ${userText}` },
  ];

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NLU,
      messages,
      temperature: 0.2,
      max_tokens: 350,
      response_format: { type: "json_object" },
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${r.status}: ${text}`);
  }

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try { parsed = JSON.parse(content); } catch { parsed = { summary: content, fields: {}, follow_up: "Could you rephrase that?" }; }
  return { parsed, raw: data };
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Enforce JSON input (but never crash if it's not)
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json") && req.method !== "GET") {
    return jsonResponse({ success: false, error: "Expected JSON body" }, { status: 400 });
  }

  try {
    // GET /functions/v1/ai-generate?mode=ping for quick checks
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("mode") === "ping") {
      return jsonResponse({ success: true, mode: "ping", reply: "pong" });
    }

    const body = (req.method === "POST") ? await req.json().catch(() => ({})) as ChatPayload : {};
    const mode = body.mode ?? "chat";

    if (mode === "ping") {
      return jsonResponse({ success: true, mode: "ping", reply: "pong" });
    }

    if (!OPENAI_KEY) {
      return jsonResponse({ success: false, error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const prompt = body.prompt ?? "";
    const level = body.context?.level ?? "ELI5";
    const transcript = body.context?.transcript ?? [];
    const priorAnswers = (body.context?.answers ?? {}) as Record<string, unknown>;

    if (mode === "nlu") {
      const { parsed, raw } = await callOpenAINLU(prompt, level, priorAnswers);
      return jsonResponse({ success: true, mode: "nlu", ...parsed, raw });
    }

    // chat mode
    const systemPrompt =
      level === "Developer" ? 
        "You are a concise senior developer-copilot. Be specific and technical, but friendly." :
      level === "Intermediate" ?
        "You are a practical product copilot. Explain clearly with light technical detail." :
        "You are a gentle teacher. Explain like I'm 5. Short, friendly, zero jargon.";

    const { reply, raw } = await callOpenAIChat(prompt, systemPrompt, transcript);
    return jsonResponse({ success: true, mode: "chat", reply, raw });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: msg }, { status: 500 });
  }
});