import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS for browsers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// tiny deterministic NLU (no LLM)
function nluExtract(raw: string) {
  const prompt = (raw || "").trim();
  const lower = prompt.toLowerCase();
  
  // Skip answer style preferences - these should be handled before NLU
  if (/(^|\b)(eli5|very simple|simple|scared of code|not technical|beginner|intermediate|some experience|medium|developer|dev|technical|advanced)(\b|$)/.test(lower)) {
    return { field: null, value: null, reply: "Please select your communication style first." };
  }
  
  if (/(^|\b)(private|privacy)(\b|$)/.test(lower)) return { field: "privacy", value: "Private", reply: "Got it: **privacy** → \"Private\"." };
  if (/share/.test(lower)) return { field: "privacy", value: "Share via link", reply: "Got it: **privacy** → \"Share via link\"." };
  if (/(^|\b)public(\b|$)/.test(lower)) return { field: "privacy", value: "Public", reply: "Got it: **privacy** → \"Public\"." };
  if (/google|oauth/.test(lower)) return { field: "auth", value: "Google OAuth", reply: "Got it: **auth** → \"Google OAuth\"." };
  if (/magic|email\s*link/.test(lower)) return { field: "auth", value: "Magic email link", reply: "Got it: **auth** → \"Magic email link\"." };
  if (/(^|\b)none(\b|$)|dev only/.test(lower)) return { field: "auth", value: "None (dev only)", reply: "Got it: **auth** → \"None (dev only)\"." };
  if (/\b0\.?5\b/.test(lower)) return { field: "deep_work_hours", value: "0.5", reply: "Got it: **deep_work_hours** → \"0.5\"." };
  if (/\b1\b/.test(lower)) return { field: "deep_work_hours", value: "1", reply: "Got it: **deep_work_hours** → \"1\"." };
  if (/\b2\b/.test(lower)) return { field: "deep_work_hours", value: "2", reply: "Got it: **deep_work_hours** → \"2\"." };
  if (/\b4\+?\b/.test(lower)) return { field: "deep_work_hours", value: "4+", reply: "Got it: **deep_work_hours** → \"4+\"." };
  if (/features?/.test(lower) || /[,;\n]/.test(prompt)) {
    const items = prompt.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean).slice(0,6);
    if (items.length) return { field: "features", value: items, reply: `Got it: **features** → "${items.join(", ")}".` };
  }
  if (/\b(name|call it)\b/.test(lower) || /^[- a-z0-9_]{3,20}$/i.test(prompt)) {
    const val = prompt.replace(/^(name:?\s*)/i, "").trim() || prompt.trim();
    const clean = val || `Project-${Math.random().toString(36).slice(2,6)}`;
    return { field: "name", value: clean, reply: `Got it: **name** → "${clean}".` };
  }
  if (/audience|users?|customers?|for\s+/.test(lower)) return { field: "audience", value: prompt, reply: `Got it: **audience** → "${prompt}".` };
  return { field: "idea", value: prompt, reply: `Got it: **idea** → "${prompt}".` };
}

serve(async (req: Request) => {
  // Preflight must be first
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mode = "chat", prompt = "" } = await req.json();

    if (mode === "nlu") {
      const res = nluExtract(prompt);
      return new Response(JSON.stringify({ success: true, mode: "nlu", field: res.field, value: res.value, reply: res.reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (mode === "roadmap") {
      return new Response(JSON.stringify({ success: true, mode: "roadmap", reply: "🚀 Generating your custom roadmap with milestones and priorities. This will help you build systematically..." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // baseline echo
    return new Response(JSON.stringify({ success: true, mode: "chat", reply: `Baseline echo: "${prompt}"` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});