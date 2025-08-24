import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Reusable CORS headers
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // tighten in prod if desired
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// --- Tiny, deterministic NLU (no LLM). Heuristics only. ---
function nluExtract(raw: string): { field: string|null; value: any; reply: string } {
  const prompt = (raw || "").trim();
  const lower = prompt.toLowerCase();

  // Privacy
  if (/(^|\b)(private|privacy)(\b|$)/.test(lower)) {
    return { field: "privacy", value: "Private", reply: `Got it: **privacy** → "Private".` };
  }
  if (/share/.test(lower)) {
    return { field: "privacy", value: "Share via link", reply: `Got it: **privacy** → "Share via link".` };
  }
  if (/(^|\b)public(\b|$)/.test(lower)) {
    return { field: "privacy", value: "Public", reply: `Got it: **privacy** → "Public".` };
  }

  // Auth
  if (/google|oauth/.test(lower)) {
    return { field: "auth", value: "Google OAuth", reply: `Got it: **auth** → "Google OAuth".` };
  }
  if (/magic|email\s*link/.test(lower)) {
    return { field: "auth", value: "Magic email link", reply: `Got it: **auth** → "Magic email link".` };
  }
  if (/(^|\b)none(\b|$)|dev only/.test(lower)) {
    return { field: "auth", value: "None (dev only)", reply: `Got it: **auth** → "None (dev only)".` };
  }

  // Deep work hours
  if (/\b0\.?5\b/.test(lower)) return { field: "deep_work_hours", value: "0.5", reply: `Got it: **deep_work_hours** → "0.5".` };
  if (/\b1\b/.test(lower)) return { field: "deep_work_hours", value: "1", reply: `Got it: **deep_work_hours** → "1".` };
  if (/\b2\b/.test(lower)) return { field: "deep_work_hours", value: "2", reply: `Got it: **deep_work_hours** → "2".` };
  if (/\b4\+?\b/.test(lower)) return { field: "deep_work_hours", value: "4+", reply: `Got it: **deep_work_hours** → "4+".` };

  // Features (comma or semicolon list, or mentions of "feature")
  if (/features?/.test(lower) || /[,;\n]/.test(prompt)) {
    const items = prompt
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (items.length) {
      return { field: "features", value: items, reply: `Got it: **features** → "${items.join(", ")}".` };
    }
  }

  // Name (simple heuristic: single short token or explicit request)
  if (/\b(name|call it)\b/.test(lower) || /^[- a-z0-9_]{3,20}$/i.test(prompt)) {
    const val = prompt.replace(/^(name:?\s*)/i, "").trim() || prompt.trim();
    const clean = val || `Project-${Math.random().toString(36).slice(2,6)}`;
    return { field: "name", value: clean, reply: `Got it: **name** → "${clean}".` };
  }

  // Audience (keywords)
  if (/audience|users?|customers?|for\s+/.test(lower)) {
    return { field: "audience", value: prompt, reply: `Got it: **audience** → "${prompt}".` };
  }

  // Default → idea
  return { field: "idea", value: prompt, reply: `Got it: **idea** → "${prompt}".` };
}

serve(async (req: Request) => {
  // CORS preflight MUST be first
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mode = "chat", prompt = "" } = await req.json();

    if (mode === "nlu") {
      const res = nluExtract(prompt);
      return new Response(
        JSON.stringify({ success: true, mode: "nlu", field: res.field, value: res.value, reply: res.reply }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Baseline echo chat (kept as fallback)
    return new Response(
      JSON.stringify({ success: true, mode: "chat", reply: `Baseline echo: "${prompt}"` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});