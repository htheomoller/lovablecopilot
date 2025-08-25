import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
	•	Pull the first top-level {…} block and try to make it strict JSON:
	•		•	remove trailing commas before } or ]
	•		•	convert smart quotes
	•		•	collapse control chars
*/
function coerceToValidJson(raw: string): string | null {
  if (!raw) return null;

  // grab first top-level JSON object block
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let s = raw.slice(start, end + 1);

  // normalize quotes
  s = s.replace(/[""]/g, '"').replace(/['']/g, "'");

  // remove trailing commas: ,\s*] or ,\s*}
  s = s.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");

  // remove BOM/control chars
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");

  return s;
}

const MODEL_DEFAULT = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const SYSTEM_STRICT = `
You are Lovable Copilot, a friendly expert who onboards a user's app idea via natural conversation.
You MUST return a single JSON object that exactly matches the schema below.
Hard rules:
	•	No extra text outside JSON, no markdown, no backticks.
	•	No lists or bullets in any string fields.
	•	No trailing commas anywhere.
	•	Always include every key required by the schema, even when null/empty.
	•	Never store placeholder phrases like "I don't know" as field values; use null or [] instead.

Schema (all keys required):
{
  "reply_to_user": string,
  "extracted": {
    "tone": "eli5" | "intermediate" | "developer" | null,
    "idea": string | null,
    "name": string | null,
    "audience": string | null,
    "features": string[],  // empty [] if none
    "privacy": "Private" | "Share via link" | "Public" | null,
    "auth": "Google OAuth" | "Magic email link" | "None (dev only)" | null,
    "deep_work_hours": "0.5" | "1" | "2" | "4+" | null
  },
  "status": {
    "complete": boolean,
    "missing": string[],     // keys from extracted that are null/empty (tone is optional)
    "next_question": string  // one short, friendly question for the next missing item
  },
  "suggestions": string[]     // short chip labels relevant to next_question
}

Behavioral rules:
	•	Converse naturally in the user's chosen "tone". If no tone yet, default to "intermediate".
	•	Never re-ask for a field you already captured unless the user changes it; if they do, acknowledge and update.
	•	If the user gives a vague or non-answer (e.g., "later", "TBD", "idk"), set that field to null and move on with a clarifying question later.
`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode = "chat", prompt = "", answers = null } = await req.json().catch(() => ({}));
    if (mode === "ping") return jsonResponse({ success: true, mode: "ping", reply: "pong" });

    if (!OPENAI_API_KEY) {
      return jsonResponse({ success: false, error: "OPENAI_API_KEY not set" }, 500);
    }

    if (mode === "chat" || mode === "extract") {
      const userMsg =
        mode === "extract"
          ? `Here is the current collected snapshot (may contain nulls): ${JSON.stringify(answers)}.\nUser said: ${prompt}`
          : prompt;

      const body = {
        model: MODEL_DEFAULT,
        // Ask OpenAI to emit strict JSON
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_STRICT.trim() },
          { role: "user", content: userMsg || "Say hello." },
        ],
        max_output_tokens: 700,
      };

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const text = await r.text();
        console.error("OpenAI upstream error:", text);
        return jsonResponse({ success: false, error: "upstream_error", details: text }, 502);
      }

      const j = await r.json();
      const raw = j?.choices?.[0]?.message?.content?.trim() || "";

      // First try: as-is parse
      let env: any = null;
      try {
        env = JSON.parse(raw);
      } catch {
        // Second try: coerce
        const fixed = coerceToValidJson(raw);
        if (fixed) {
          try {
            env = JSON.parse(fixed);
          } catch (e2) {
            console.error("Parse failed after coerce:", e2, { fixed });
          }
        }
      }

      if (!env || typeof env !== "object") {
        // graceful fallback – keep the chat alive
        return jsonResponse({
          success: true,
          mode,
          repaired: false,
          raw,
          reply: "I had trouble parsing that. I'll keep going and ask the next question—feel free to continue.",
        });
      }

      // Basic envelope validation + normalization
      const must = ["reply_to_user", "extracted", "status", "suggestions"];
      for (const k of must) if (!(k in env)) env[k] = k === "suggestions" ? [] : k === "extracted" ? {} : {};

      // ensure all extracted keys exist
      env.extracted = {
        tone: env.extracted.tone ?? null,
        idea: env.extracted.idea ?? null,
        name: env.extracted.name ?? null,
        audience: env.extracted.audience ?? null,
        features: Array.isArray(env.extracted.features) ? env.extracted.features : [],
        privacy: env.extracted.privacy ?? null,
        auth: env.extracted.auth ?? null,
        deep_work_hours: env.extracted.deep_work_hours ?? null,
      };

      // ensure status shape
      env.status = {
        complete: !!env.status.complete,
        missing: Array.isArray(env.status.missing) ? env.status.missing : [],
        next_question: typeof env.status.next_question === "string" ? env.status.next_question : "",
      };

      // ensure suggestions array
      env.suggestions = Array.isArray(env.suggestions) ? env.suggestions : [];

      return jsonResponse({ success: true, mode, envelope: env });
    }

    // default fallback
    return jsonResponse({ success: true, mode: "chat", reply: `Baseline echo: "${prompt}"` });

  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
