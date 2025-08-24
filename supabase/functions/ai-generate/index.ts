/**
 * ai-generate — Guided onboarding + chat
 * Modes:
 *   • chat: general small-talk/answers
 *   • extract: LLM JSON extraction for a single user message (fills slots)
 *   • roadmap: generate roadmap + milestones JSON from collected answers
 *   • ping: health check
 * 
 * Requires secret: OPENAI_API_KEY
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

// —– LLM client —–
async function openAIChat(payload: unknown) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI error: ${r.status} ${r.statusText} :: ${t}`);
  }
  return await r.json();
}

// Shared system messages
const SYS_CHAT = `You are Copilot for onboarding. Be warm, concise, and conversational.
 • Reflect user intent in a short sentence.
 • Ask exactly ONE clear follow-up when needed.
 • If they seem unsure, suggest concrete examples.
 • Avoid over-explaining unless asked.
`;

const SYS_EXTRACT = `You extract structured onboarding data from ONE user message.
Return ONLY a compact JSON object matching this TypeScript type:
{
  "idea"?: string,
  "name"?: string,
  "audience"?: string,
  "features"?: string[],        // 2-6 short items max
  "privacy"?: "Private" | "Share via link" | "Public",
  "auth"?: "Google OAuth" | "Magic email link" | "None (dev only)",
  "deep_work_hours"?: "0.5" | "1" | "2" | "4+"
}
Rules:
 • Normalize to ONE-LINERS.
 • If message is clearly about "style" (ELI5/Intermediate/Developer), do NOT set fields; let UI handle style separately.
 • Do NOT invent values. Only include keys confidently implied by the message.
 • For features: split on commas/lines; trim to short labels; max 6.
 • Output JSON only, no prose.`;

const SYS_ROADMAP = `You are a product copilot. Given the user's normalized answers JSON, create a concise roadmap and 3-5 milestones.
Output JSON:
{
  "summary": string,   // short paragraph
  "milestones": [
    {
      "name": string,
      "description": string,
      "duration_days": number
    }
  ]
}
Rules:
 • Keep practical and specific.
 • Scope to the answers (auth, privacy, features, hours).
 • Prefer 3-4 milestones. No dates, just duration_days. JSON only.`;

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { mode = "chat", prompt = "", answers = null } = await req.json().catch(() => ({}));
    if (mode === "ping") return jsonResponse({ success: true, mode: "ping", reply: "pong" });

    if (mode === "extract") {
      const payload = {
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYS_EXTRACT },
          { role: "user", content: prompt || "" },
        ],
        max_tokens: 500,
      };
      const data = await openAIChat(payload);
      const text = data?.choices?.[0]?.message?.content?.trim() || "{}";
      // Be strict: try JSON only.
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(text); } catch { /* fallback to empty */ }
      return jsonResponse({ success: true, mode: "extract", fields: parsed, raw: text });
    }

    if (mode === "roadmap") {
      const payload = {
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYS_ROADMAP },
          { role: "user", content: `Answers JSON:\n${JSON.stringify(answers ?? {}, null, 2)}` },
        ],
        max_tokens: 900,
      };
      const data = await openAIChat(payload);
      const text = data?.choices?.[0]?.message?.content?.trim() || "{}";
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      return jsonResponse({ success: true, mode: "roadmap", roadmap: parsed, raw: text });
    }

    // default: chat
    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: SYS_CHAT },
        { role: "user", content: prompt || "" },
      ],
      max_tokens: 600,
    };
    const data = await openAIChat(payload);
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return jsonResponse({ success: true, mode: "chat", reply: text });

  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || String(err) }, 500);
  }
});