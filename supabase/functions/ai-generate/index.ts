import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS (adjust origin for prod if needed)
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json"
};

type Mode = "ping" | "chat" | "extract";
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function errorJSON(message: string, code: string, details?: unknown, status = 500) {
  return json({ success: false, error: code, message, details }, status);
}

async function callOpenAI(messages: Array<{role:"system"|"user"|"assistant", content:string}>) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    // Don't attempt upstream call if key is missing
    return { ok: false, reason: "missing_openai_key" as const, body: null };
  }

  const body = {
    // Use a reliable, cost‑effective conversational model; adjust if you prefer:
    model: "gpt-4o-mini",
    messages,
    temperature: 0.4,
    max_tokens: 600
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await r.text();

  if (!r.ok) {
    return { ok: false, reason: "upstream_non_200" as const, body: raw, status: r.status };
  }

  // Try to parse JSON; if it fails, return parse error with raw
  try {
    const j = JSON.parse(raw);
    const text = j?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text, raw };
  } catch {
    return { ok: false, reason: "upstream_invalid_json" as const, body: raw };
  }
}

// Minimal, strict extractor: model must return a single JSON object.
// If not parseable, we bubble raw text back so UI can display.
// The system prompt should be provided by the client; this function just calls OpenAI.
async function llmJSONExtract(userPrompt: string, sysPrompt: string) {
  const result = await callOpenAI([
    { role: "system", content: sysPrompt },
    { role: "user", content: userPrompt }
  ]);

  if (!result.ok) return result;

  // Attempt to isolate a JSON object in result.text
  const text: string = (result as any).text || "";
  const match = text.match(/{[\s\S]*}$/); // greedy to last brace
  if (!match) {
    return { ok: false, reason: "no_json_object_found" as const, body: text };
  }
  try {
    const obj = JSON.parse(match[0]);
    return { ok: true, obj, raw: (result as any).raw };
  } catch {
    return { ok: false, reason: "json_parse_error" as const, body: text };
  }
}

serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Route
  try {
    const { mode, prompt = "", system = "", extract = false } = await req.json().catch(() => ({}));
    const m = (mode as Mode) || "chat";

    // Health check that never touches OpenAI
    if (m === "ping") {
      return json({ success: true, mode: "ping", reply: "pong" });
    }

    if (m === "chat") {
      const result = await callOpenAI([
        { role: "system", content: system || "You are a friendly product copilot. Answer concisely and helpfully." },
        { role: "user", content: prompt || "Say hello." }
      ]);

      if (!result.ok) {
        if (result.reason === "missing_openai_key") {
          return errorJSON("OPENAI_API_KEY is not set in Edge Function secrets.", "missing_openai_key", null, 500);
        }
        if (result.reason === "upstream_non_200") {
          return errorJSON("OpenAI returned a non-200 response.", "upstream_error", { status: result.status, raw: result.body }, 502);
        }
        if (result.reason === "upstream_invalid_json") {
          return errorJSON("OpenAI returned invalid JSON.", "upstream_invalid_json", { raw: result.body }, 502);
        }
        return errorJSON("Unknown upstream error.", "upstream_error_unknown", result, 502);
      }

      return json({ success: true, mode: "chat", reply: (result as any).text, raw: (result as any).raw });
    }

    if (m === "extract") {
      // Expect a system prompt that enforces the JSON envelope (the EXTRACTOR SPEC)
      if (!system) {
        return errorJSON("Missing extractor system prompt.", "missing_system_prompt", null, 400);
      }
      const result = await llmJSONExtract(prompt, system);

      if (!result.ok) {
        if (result.reason === "missing_openai_key") {
          return errorJSON("OPENAI_API_KEY is not set in Edge Function secrets.", "missing_openai_key", null, 500);
        }
        if (result.reason === "upstream_non_200") {
          return errorJSON("OpenAI returned a non-200 response.", "upstream_error", { status: (result as any).status, raw: (result as any).body }, 502);
        }
        if (result.reason === "upstream_invalid_json") {
          return errorJSON("OpenAI returned invalid JSON.", "upstream_invalid_json", { raw: (result as any).body }, 502);
        }
        // JSON parse problems at the model layer
        return errorJSON("Failed to parse model JSON.", result.reason ?? "extract_parse_error", { raw: (result as any).body }, 422);
      }

      return json({ success: true, mode: "extract", data: (result as any).obj, raw: (result as any).raw });
    }

    // Unknown mode
    return errorJSON(`Unknown mode: ${m}`, "bad_mode", null, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorJSON(msg, "server_error", null, 500);
  }
});
