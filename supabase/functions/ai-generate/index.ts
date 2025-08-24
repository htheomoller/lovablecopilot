import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

function nluExtract(raw: string): { field: string|null; value: any; reply: string } {
  const prompt = (raw || "").trim();
  const lower = prompt.toLowerCase();
  if (/(^|\b)(private|privacy)(\b|$)/.test(lower)) return { field: "privacy", value: "Private", reply: `Got it: **privacy** → "Private".` };
  if (/share/.test(lower)) return { field: "privacy", value: "Share via link", reply: `Got it: **privacy** → "Share via link".` };
  if (/(^|\b)public(\b|$)/.test(lower)) return { field: "privacy", value: "Public", reply: `Got it: **privacy** → "Public".` };
  if (/google|oauth/.test(lower)) return { field: "auth", value: "Google OAuth", reply: `Got it: **auth** → "Google OAuth".` };
  if (/magic|email\s*link/.test(lower)) return { field: "auth", value: "Magic email link", reply: `Got it: **auth** → "Magic email link".` };
  if (/(^|\b)none(\b|$)|dev only/.test(lower)) return { field: "auth", value: "None (dev only)", reply: `Got it: **auth** → "None (dev only)".` };
  if (/\b0\.?5\b/.test(lower)) return { field: "deep_work_hours", value: "0.5", reply: `Got it: **deep_work_hours** → "0.5".` };
  if (/\b1\b/.test(lower)) return { field: "deep_work_hours", value: "1", reply: `Got it: **deep_work_hours** → "1".` };
  if (/\b2\b/.test(lower)) return { field: "deep_work_hours", value: "2", reply: `Got it: **deep_work_hours** → "2".` };
  if (/\b4\+?\b/.test(lower)) return { field: "deep_work_hours", value: "4+", reply: `Got it: **deep_work_hours** → "4+".` };
  if (/features?/.test(lower) || /[,;\n]/.test(prompt)) {
    const items = prompt.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0,6);
    if (items.length) return { field: "features", value: items, reply: `Got it: **features** → "${items.join(", ")}".` };
  }
  if (/\b(name|call it)\b/.test(lower)) {
    const val = prompt.replace(/^(name:?\s*)/i, "").trim();
    const clean = val || `Project-${Math.random().toString(36).slice(2,6)}`;
    return { field: "name", value: clean, reply: `Got it: **name** → "${clean}".` };
  }
  if (/audience|users?|customers?|for\s+/.test(lower)) {
    return { field: "audience", value: prompt, reply: `Got it: **audience** → "${prompt}".` };
  }
  return { field: "idea", value: prompt, reply: `Got it: **idea** → "${prompt}".` };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { mode = "chat", prompt = "" } = await req.json();
    if (mode === "nlu") {
      const res = nluExtract(prompt);
      return new Response(JSON.stringify({ success: true, mode: "nlu", field: res.field, value: res.value, reply: res.reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, mode: "chat", reply: `Baseline echo: "${prompt}"` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});