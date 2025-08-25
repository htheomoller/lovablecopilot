import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** CORS */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

/** ——————————————————————————————————————————————————————————————————————————————————————————————————
 *   SYSTEM PROMPT (Onboarding Copilot)
 * ——————————————————————————————————————————————————————————————————————————————————————————————————
 *   The model must ALWAYS reply with a single valid JSON object matching EXTRACTOR_SPEC.
 */
const SYSTEM_ONBOARDER = `
You are Lovable Copilot, a warm, expert assistant that onboards users to a new app idea through a natural conversation. Be encouraging, adapt to the user's tone, keep memory of filled fields, never store placeholders like "I don't know", and never ask for things already captured unless the user changes them.

Objectives:
 • Converse naturally (not a rigid form).
 • Quietly extract fields as they appear: tone, idea, name, audience, features, privacy, auth, deep_work_hours.
 • If a user revises a filled field, acknowledge the change and update it.
 • Tones must be one of: "eli5", "intermediate", "developer". If none provided, default to "intermediate" for reply style, but keep "tone" null until user states a preference.
 • For ambiguity or placeholders (e.g., "not sure", "TBD"), set that field to null and ask a friendly clarifying question later.
 • When all fields (except tone) are complete, summarize in a single, bullet‑free paragraph and ask for confirmation to proceed.

Safety:
 • Decline topics unrelated to app building; steer back to the project politely.

EXTRACTOR_SPEC (shape you MUST output, and nothing else):
{
  "reply_to_user": string,
  "extracted": {
    "tone": "eli5" | "intermediate" | "developer" | null,
    "idea": string | null,
    "name": string | null,
    "audience": string | null,
    "features": string[],   // [] if none
    "privacy": "Private" | "Share via link" | "Public" | null,
    "auth": "Google OAuth" | "Magic email link" | "None (dev only)" | null,
    "deep_work_hours": "0.5" | "1" | "2" | "4+" | null
  },
  "status": {
    "complete": boolean,          // true only when all extracted fields except tone are non-null/non-empty
    "missing": string[],          // keys still null/empty from extracted
    "next_question": string       // one clear question that targets one missing field
  },
  "suggestions": string[]         // short labels for quick-reply chips relevant to next_question
}

Output Rules:
 • You MUST return only one JSON object that strictly matches EXTRACTOR_SPEC.
 • Never include prose outside JSON.
 • If parsing user input yields no progress, still respond with a helpful "reply_to_user" and a concrete "next_question" with 2–5 actionable "suggestions".
 • For privacy/auth/deep_work_hours, prefer suggestions from the allowed sets.
`;

/** Minimal OpenAI client via fetch */
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY_BETA") || "";

/** Helper: JSON response */
function jsonOk(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/** Helper: error response */
function jsonErr(status: number, message: string, details: unknown = null) {
  return jsonOk({ success: false, error: "upstream_error", message, details }, { status });
}

/** Call OpenAI with system prompt + user message */
async function callOnboarder(userText: string) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const payload = {
    model: OPENAI_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_ONBOARDER },
      { role: "user", content: userText }
    ]
  };
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  return raw;
}

/** Ping + Chat handler */
serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return jsonErr(400, "Expected JSON body");
    }

    const { mode = "chat", prompt = "" } = await req.json().catch(() => ({}));

    if (mode === "ping") {
      return jsonOk({ success: true, mode: "ping", reply: "pong" });
    }

    if (mode !== "chat") {
      return jsonErr(400, "Unsupported mode", { mode });
    }

    // ---- CHAT with onboarder system prompt
    const raw = await callOnboarder(String(prompt || "").trim());

    // Try to parse JSON; if it fails, wrap as reply_to_user-only fallback matching the contract
    try {
      const parsed = JSON.parse(raw);
      // Minimal validation: ensure top-level keys exist
      if (
        typeof parsed === "object" && parsed &&
        "reply_to_user" in parsed && "extracted" in parsed && "status" in parsed && "suggestions" in parsed
      ) {
        return jsonOk({ success: true, mode: "chat", ...parsed });
      }
      // If not matching, coerce into contract
      return jsonOk({
        success: true,
        mode: "chat",
        reply_to_user: typeof raw === "string" ? raw : "Let's keep going. What would you like to clarify next?",
        extracted: { tone: null, idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null },
        status: { complete: false, missing: ["idea"], next_question: "What's your app idea in one short line?" },
        suggestions: ["Photo restoration app", "Recipe planner", "Workout tracker"]
      });
    } catch {
      // Parsing failed → still return a valid envelope
      return jsonOk({
        success: true,
        mode: "chat",
        reply_to_user: typeof raw === "string" && raw.trim() ? raw.trim() : "Got it. What's your app idea in one short line?",
        extracted: { tone: null, idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null },
        status: { complete: false, missing: ["idea"], next_question: "What's your app idea in one short line?" },
        suggestions: ["Photo restoration app", "Reading tracker", "Budget buddy"]
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonErr(500, msg);
  }
});
