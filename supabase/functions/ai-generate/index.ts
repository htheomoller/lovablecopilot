/**
 * Copilot Edge Function — strict JSON contract + schema guard + chip suggestions
 * Modes:
 *   • POST {"mode":"ping"} -> {"success":true,"mode":"ping","reply":"pong"}
 *   • POST {"mode":"chat","prompt":"…","projectId?":string} -> JSON envelope
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

type Envelope = {
  reply_to_user: string;
  extracted: Extracted;
  status: {
    complete: boolean;
    missing: Array<keyof Omit<Extracted, "tone"> | "tone">;
    next_question: string;
  };
  suggestions: string[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL =
  Deno.env.get("OPENAI_MODEL") ??
  "gpt-4o-mini"; // inexpensive, good quality

// –– Utility: JSON-safe response
function json200(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function json400(err: string, details: unknown = null) {
  return new Response(
    JSON.stringify({ success: false, error: err, message: err, details }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
function json500(err: string, details: unknown = null) {
  return new Response(
    JSON.stringify({ success: false, error: "upstream_error", message: err, details }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// –– Schema Guard (no deps)
function isExtracted(x: any): x is Extracted {
  if (!x || typeof x !== "object") return false;
  const toneOk =
    x.tone === null || x.tone === "eli5" || x.tone === "intermediate" || x.tone === "developer";
  const strOrNull = (v: any) => v === null || typeof v === "string";
  const featuresOk = Array.isArray(x.features) && x.features.every((s: any) => typeof s === "string");
  const privacyOk = x.privacy === null || ["Private", "Share via link", "Public"].includes(x.privacy);
  const authOk =
    x.auth === null || ["Google OAuth", "Magic email link", "None (dev only)"].includes(x.auth);
  const hoursOk = x.deep_work_hours === null || ["0.5", "1", "2", "4+"].includes(x.deep_work_hours);
  return (
    toneOk &&
    strOrNull(x.idea) &&
    strOrNull(x.name) &&
    strOrNull(x.audience) &&
    featuresOk &&
    privacyOk &&
    authOk &&
    hoursOk
  );
}
function isEnvelope(e: any): e is Envelope {
  if (!e || typeof e !== "object") return false;
  const statusOk =
    e.status &&
    typeof e.status === "object" &&
    typeof e.status.complete === "boolean" &&
    Array.isArray(e.status.missing) &&
    typeof e.status.next_question === "string";
  const suggOk = Array.isArray(e.suggestions) && e.suggestions.every((s: any) => typeof s === "string");
  return typeof e.reply_to_user === "string" && isExtracted(e.extracted) && statusOk && suggOk;
}
// Sanitizer: trim to first question only, dedupe whitespace
function sanitizeNextQ(q: string): string {
  const cleaned = (q || "").replace(/\s+/g, " ").trim();
  const idx = cleaned.indexOf("?");
  if (idx >= 0) return cleaned.slice(0, idx + 1);
  return cleaned;
}
function clampEnvelope(env: Envelope): Envelope {
  return {
    reply_to_user: (env.reply_to_user || "").trim(),
    extracted: {
      tone: env.extracted.tone ?? null,
      idea: env.extracted.idea ?? null,
      name: env.extracted.name ?? null,
      audience: env.extracted.audience ?? null,
      features: Array.isArray(env.extracted.features) ? env.extracted.features.slice(0, 8) : [],
      privacy: env.extracted.privacy ?? null,
      auth: env.extracted.auth ?? null,
      deep_work_hours: env.extracted.deep_work_hours ?? null,
    },
    status: {
      complete: !!env.status.complete,
      missing: Array.isArray(env.status.missing) ? env.status.missing.slice(0, 12) : [],
      next_question: sanitizeNextQ(env.status.next_question || ""),
    },
    suggestions: Array.isArray(env.suggestions) ? env.suggestions.slice(0, 6) : [],
  };
}

// –– System Prompt (Extractor)
const SYSTEM_PROMPT = `You are Lovable Copilot. Speak warmly and naturally. STRICTLY output a single JSON object that matches the EXTRACTOR SPEC.  Never include extra prose, backticks, or code fences. If the user provides a non-answer like "I don't know" or "later", set that field to null.  Only ONE next_question — a single sentence ending with a question mark. Prefer short, helpful "suggestions" relevant to the next_question (max 6).`;

// –– Spec string injected so the model can follow it verbatim
const EXTRACTOR_SPEC = `{ "reply_to_user": "string", "extracted": { "tone": "eli5 | intermediate | developer | null", "idea": "string | null", "name": "string | null", "audience": "string | null", "features": "string[]", "privacy": "Private | Share via link | Public | null", "auth": "Google OAuth | Magic email link | None (dev only) | null", "deep_work_hours": "0.5 | 1 | 2 | 4+ | null" }, "status": { "complete": "boolean", "missing": "Array<string>", "next_question": "string // exactly one sentence that ends with '?'" }, "suggestions": "Array<string> // max 6 items" }`;

// –– Upstream call
async function callOpenAI(user: string) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  const content = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: `EXTRACTOR SPEC:\n${EXTRACTOR_SPEC}` },
    { role: "user", content: user },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: content,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  return String(raw);
}

// –– Request Handler
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { mode = "chat", prompt = "" } = await req.json().catch(() => ({}));

    if (mode === "ping") {
      return json200({ success: true, mode: "ping", reply: "pong" });
    }

    if (mode !== "chat") return json400("unsupported_mode");

    // 1) Call LLM
    const raw = await callOpenAI(String(prompt || ""));
    // 2) Parse strictly (handle accidental fences)
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json400("invalid_json_from_model", { raw });
    }
    // 3) Schema guard + clamp
    if (!isEnvelope(parsed)) {
      return json400("invalid_envelope_from_model", { raw, parsed });
    }
    const env = clampEnvelope(parsed);

    // Hard rule: ensure exactly one question and never duplicate with reply
    if (env.status.next_question && env.reply_to_user.includes(env.status.next_question)) {
      // keep next_question only for UI placeholder/chips; don't duplicate in reply
      // (no change needed, just a note)
    }

    return json200({
      success: true,
      mode: "chat",
      envelope: env,
    });
  } catch (err: any) {
    return json500(err?.message || String(err));
  }
});
