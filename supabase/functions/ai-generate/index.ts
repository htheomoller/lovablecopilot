/**
 * Edge function: ai-generate
 * Modes:
 *   • ping: health check -> { reply: "pong" }
 *   • chat: OpenAI-powered reply -> { reply: string }
 * 
 * Requirements:
 *   • Set OPENAI_API_KEY in Supabase Edge Function secrets.
 * 
 * (In Lovable/Supabase, this was already added earlier.)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, init?: ResponseInit) {
  const headers = { "Content-Type": "application/json", ...corsHeaders, ...(init?.headers ?? {}) };
  return new Response(JSON.stringify(body), { ...init, headers });
}

serve(async (req: Request) => {
  // Always handle CORS preflight FIRST
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // If no/invalid JSON, return a helpful error in JSON (prevents client .json() crashes)
    return json({ success: false, error: "invalid_json_body" }, { status: 400 });
  }

  const mode = String(body.mode ?? "chat");
  const prompt = String(body.prompt ?? "");
  const answerStyle = String(body.answer_style ?? "eli5"); // optional, not strictly used yet

  // Simple health check
  if (mode === "ping") {
    return json({ success: true, mode: "ping", reply: "pong" }, { status: 200 });
  }

  // Basic guardrail
  if (!prompt.trim()) {
    return json({ success: false, error: "missing_prompt" }, { status: 400 });
  }

  // Chat mode -> OpenAI call
  if (mode === "chat") {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      // Fail soft: return a clear JSON error so the frontend can show a friendly message
      return json({ success: false, error: "OPENAI_API_KEY_not_set" }, { status: 500 });
    }

    // Lightweight, friendly system prompt. Keep it short; we'll refine later as needed.
    const systemPrompt =
      "You are a friendly product copilot helping a user describe their app idea. " +
      "Respond naturally in one short paragraph. Be warm, clear, and conversational. " +
      "If the user seems non-technical, keep it ELI5-level simple; if they ask for developer detail, be specific. " +
      "Avoid making up facts; ask one simple follow-up question when helpful.";

    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          // modest cap to keep costs low; adjust later
          max_tokens: 400,
        }),
      });

      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        return json(
          { success: false, error: "openai_upstream_error", details: errText || `${r.status} ${r.statusText}` },
          { status: 502 },
        );
      }

      const data = await r.json();
      const text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

      return json({ success: true, mode: "chat", reply: text }, { status: 200 });
    } catch (e) {
      return json(
        { success: false, error: "openai_fetch_failed", details: String((e as Error)?.message ?? e) },
        { status: 500 },
      );
    }
  }

  // Unknown mode
  return json({ success: false, error: "unknown_mode", mode }, { status: 400 });
});