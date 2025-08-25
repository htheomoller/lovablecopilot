import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
	•	Minimal, robust Edge Function for Copilot
	•	Modes:
	•		•	ping: health check (no OpenAI)
	•		•	chat: natural conversational reply (OpenAI)
	•		•	extract: conversation + structured JSON envelope (OpenAI)
	•	
	•	Requires env:
	•		•	OPENAI_API_KEY
	•	Optional:
	•		•	OPENAI_CHAT_MODEL (default: gpt-4o-mini)
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

type Extracted = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};

type Payload = {
  mode?: "ping" | "chat" | "extract";
  prompt?: string;
  answers?: Partial<Extracted>;
  tone?: "eli5" | "intermediate" | "developer";
};

const SYSTEM_PROMPT = `
You are Lovable Copilot, a friendly expert that onboards a user's app idea via natural conversation. Respond warmly and clearly; never feel like a rigid form.
Objectives:
	•	Converse naturally and adapt to the user's tone preference: "eli5", "intermediate", or "developer". Default to "intermediate" if unknown.
	•	Quietly extract these fields as the chat progresses: tone, idea, name, audience, features[], privacy, auth, deep_work_hours.
	•	Never ask for info already captured; if the user changes a value, acknowledge and update it.
	•	Treat vague placeholders ("I don't know", "TBD", "later") as null and ask a gentle follow-up later; never store such literals.
	•	When everything (except tone) is filled, summarize in a brief, bullet-free paragraph and ask for confirmation to proceed.
	•	Stay on topic (app building). Redirect if asked for unrelated/harmful content.

You MUST return ONLY a single JSON object with this shape:
{
  "reply_to_user": "string",
  "extracted": {
    "tone": "eli5|intermediate|developer|null",
    "idea": "string|null",
    "name": "string|null",
    "audience": "string|null",
    "features": ["string", …], // [] if none
    "privacy": "Private|Share via link|Public|null",
    "auth": "Google OAuth|Magic email link|None (dev only)|null",
    "deep_work_hours": "0.5|1|2|4+|null"
  },
  "status": {
    "complete": true|false, // true only when all extracted fields EXCEPT tone are non-null/non-empty
    "missing": ["field", …], // the remaining keys to obtain
    "next_question": "string" // one friendly question aimed at the most important missing piece
  },
  "suggestions": ["short chip", …] // optional quick-reply chips relevant to next_question
}

Rules:
	•	Output must be valid JSON: no markdown, no comments, no extra text.
	•	Keep "features" concise strings; avoid long sentences there.
	•	Use the user's current partial state (provided separately) as the single source of truth for what is already known.
`.trim();

async function openAIChat(messages: any[], maxTokens = 600) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = Deno.env.get("OPENAI_CHAT_MODEL") || "gpt-4o-mini";

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens })
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI upstream error: ${t}`);
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  return String(text);
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode = "chat", prompt = "", answers = {}, tone }: Payload = await req.json().catch(() => ({}));

    if (mode === "ping") {
      return json({ success: true, mode: "ping", reply: "pong" });
    }

    if (mode === "chat") {
      const userTone = tone || (answers.tone as any) || "intermediate";
      const sys = `${SYSTEM_PROMPT}\n\nReturn the JSON envelope described above.\nTone to use: ${userTone}`;
      const messages = [
        { role: "system", content: sys },
        { role: "user", content: `User said: "${prompt}"\nCurrent extracted (may be partial): ${JSON.stringify(answers || {})}` }
      ];

      const raw = await openAIChat(messages, 700);

      // Try strict JSON parse; if it fails, provide a guarded error with the raw text for debugging
      try {
        const parsed = JSON.parse(raw);
        return json({ success: true, mode: "chat", ...parsed });
      } catch {
        // As a fallback, still respond but mark parse_error to help the client surface it
        return json({ success: true, mode: "chat", parse_error: true, raw });
      }
    }

    if (mode === "extract") {
      // Same as chat, but the client expects strictly the JSON envelope
      const userTone = tone || (answers.tone as any) || "intermediate";
      const sys = `${SYSTEM_PROMPT}\n\nReturn the JSON envelope described above.\nTone to use: ${userTone}`;
      const messages = [
        { role: "system", content: sys },
        { role: "user", content: `User said: "${prompt}"\nCurrent extracted (may be partial): ${JSON.stringify(answers || {})}` }
      ];

      const raw = await openAIChat(messages, 700);
      try {
        const parsed = JSON.parse(raw);
        return json({ success: true, mode: "extract", ...parsed });
      } catch (e) {
        return json({ success: false, mode: "extract", error: "model_returned_non_json", raw }, { status: 502 });
      }
    }

    // Unknown mode
    return json({ success: false, error: `unknown_mode: ${mode}` }, { status: 400 });

  } catch (err: any) {
    return json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
});
