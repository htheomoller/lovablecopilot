/**
 * ai-generate – OpenAI-backed chat + extractor
 * - Supports modes: "ping", "chat"
 * - Always replies with JSON: { success, mode, reply, raw?, extracted?, status?, suggestions? }
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// ---------- Model + API ----------
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

// ---------- System Prompts ----------
const SYSTEM_CHAT = `
You are Lovable Copilot, a warm, natural product companion. Be concise, avoid repeating the same question,
and move the conversation forward. If the user gave an answer already, acknowledge it and ask the next
most useful question. Keep tone aligned to "eli5", "intermediate", or "developer" if provided in context.
`;

const SYSTEM_EXTRACTOR = `
You are Lovable Copilot, a friendly assistant for app onboarding.

Your objectives:
- Converse naturally (no rigid form-fill tone).
- Extract quietly these fields: tone, idea, name, audience, features, privacy, auth, deep_work_hours.
- Never store literal non-answers such as "I don't know" or "TBD" (use null instead and ask a follow-up later).
- If a field changes, confirm the update briefly and proceed.
- Summarize and confirm once everything is filled.

Output Contract (STRICT): return ONLY a single valid JSON object matching:

{
  "reply_to_user": "string",
  "extracted": {
    "tone": "eli5" | "intermediate" | "developer" | null,
    "idea": string | null,
    "name": string | null,
    "audience": string | null,
    "features": string[],        // [] if none
    "privacy": "Private" | "Share via link" | "Public" | null,
    "auth": "Google OAuth" | "Magic email link" | "None (dev only)" | null,
    "deep_work_hours": "0.5" | "1" | "2" | "4+" | null
  },
  "status": {
    "complete": boolean,         // true only if all extracted fields except tone are filled
    "missing": string[],         // keys still missing
    "next_question": string      // one friendly question for a single missing field
  },
  "suggestions": string[]        // short chip labels relevant to next_question
}

Do not include Markdown code fences, comments, or any extra text outside the JSON.
If user content is vague/placeholder, keep the corresponding field null and ask a clearer follow-up.
`;

// ---------- Helpers ----------
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function openAIChat(messages: { role: "system" | "user"; content: string }[], responseFormat?: "json") {
  const fmt = responseFormat === "json" ? { type: "json_object" } : undefined;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      response_format: fmt,
      temperature: 0.3
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`upstream_error_${res.status}:${txt}`);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content ?? "";
  return reply;
}

// ---------- Edge entry ----------
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return jsonResponse({ success: false, error: "bad_request", message: "Expected JSON body" }, 400);
    }

    const { mode = "chat", prompt = "", context = {} } = await req.json().catch(() => ({}));

    // Health check
    if (mode === "ping") {
      return jsonResponse({ success: true, mode: "ping", reply: "pong" });
    }

    if (!OPENAI_API_KEY) {
      return jsonResponse({ success: false, error: "missing_api_key", message: "OPENAI_API_KEY not set" }, 500);
    }

    // Build messages for extractor (JSON envelope) so the UI can parse once and render chips.
    const extractorUser = JSON.stringify({
      user_message: prompt,
      ui_context: {
        tone: context?.tone ?? null
      }
    });

    // Ask the extractor for a strict JSON object
    const extractorReply = await openAIChat(
      [
        { role: "system", content: SYSTEM_EXTRACTOR },
        { role: "user", content: extractorUser }
      ],
      "json"
    );

    // Try to parse the strict JSON; if it fails, fall back to a plain chat reply so the app never breaks.
    let parsed: any | null = null;
    try { parsed = JSON.parse(extractorReply); } catch { parsed = null; }

    if (parsed && typeof parsed === "object" && parsed.reply_to_user) {
      return jsonResponse({
        success: true,
        mode: "chat",
        reply: parsed.reply_to_user,
        extracted: parsed.extracted ?? null,
        status: parsed.status ?? null,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        raw: extractorReply
      });
    }

    // Fallback: normal chat (no JSON contract), still move the convo forward
    const chatReply = await openAIChat(
      [
        { role: "system", content: SYSTEM_CHAT },
        { role: "user", content: prompt }
      ]
    );

    return jsonResponse({
      success: true,
      mode: "chat",
      reply: chatReply,
      raw: extractorReply
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: "upstream_error", message: msg, details: null }, 500);
  }
});