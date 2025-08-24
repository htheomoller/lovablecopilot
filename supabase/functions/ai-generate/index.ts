import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS headers (tighten Access-Control-Allow-Origin in prod)
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

function json(res: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(res), {
    ...(init || {}),
    headers: { ...(init?.headers || {}), ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Tiny deterministic NLU (no LLM) so we can capture structured answers
function nluExtract(raw: string): { field: string; value: any; reply: string } {
  const prompt = (raw || "").trim();
  const lower = prompt.toLowerCase();

  // style choice quick picks
  if (/^eli5$/.test(lower)) return { field: "answer_style", value: "eli5", reply: "Got it — I'll keep it super simple (ELI5). What's your app idea in one line?" };
  if (/^intermediate$/.test(lower)) return { field: "answer_style", value: "intermediate", reply: "Cool — I'll be moderately technical. What's your app idea in one line?" };
  if (/^developer$/.test(lower)) return { field: "answer_style", value: "developer", reply: "Alright — I'll be precise. What's your app idea in one line?" };

  // privacy
  if (/(^|\b)(private|privacy)(\b|$)/.test(lower)) return { field: "privacy", value: "Private", reply: "Noted: privacy → Private." };
  if (/share/.test(lower)) return { field: "privacy", value: "Share via link", reply: "Noted: privacy → Share via link." };
  if (/(^|\b)public(\b|$)/.test(lower)) return { field: "privacy", value: "Public", reply: "Noted: privacy → Public." };

  // auth
  if (/google|oauth/.test(lower)) return { field: "auth", value: "Google OAuth", reply: "Auth → Google OAuth." };
  if (/magic|email\s*link/.test(lower)) return { field: "auth", value: "Magic email link", reply: "Auth → Magic email link." };
  if (/(^|\b)none(\b|$)|dev only/.test(lower)) return { field: "auth", value: "None (dev only)", reply: "Auth → None (dev only)." };

  // deep work hours
  if (/\b0\.?5\b/.test(lower)) return { field: "deep_work_hours", value: "0.5", reply: "Daily hours → 0.5." };
  if (/\b1\b/.test(lower)) return { field: "deep_work_hours", value: "1", reply: "Daily hours → 1." };
  if (/\b2\b/.test(lower)) return { field: "deep_work_hours", value: "2", reply: "Daily hours → 2." };
  if (/\b4\+?\b/.test(lower)) return { field: "deep_work_hours", value: "4+", reply: "Daily hours → 4+." };

  // features (comma/semicolon/newline list)
  if (/features?/.test(lower) || /[,;\n]/.test(prompt)) {
    const items = prompt.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 6);
    if (items.length) return { field: "features", value: items, reply: `Features → "${items.join(", ")}".` };
  }

  // name (short token or explicit)
  if (/\b(name|call it)\b/.test(lower) || /^[- a-z0-9_]{3,20}$/i.test(prompt)) {
    const val = prompt.replace(/^(name:?\s*)/i, "").trim() || prompt.trim();
    const clean = val || `Project-${Math.random().toString(36).slice(2, 6)}`;
    return { field: "name", value: clean, reply: `Name → "${clean}".` };
  }

  // audience (keywords)
  if (/audience|users?|customers?|for\s+/.test(lower)) return { field: "audience", value: prompt, reply: `Audience → "${prompt}".` };

  // default → idea
  return { field: "idea", value: prompt, reply: `Idea → "${prompt}".` };
}

serve(async (req: Request) => {
  // CORS preflight FIRST
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const mode = body?.mode || "chat";
    const prompt = body?.prompt ?? "";

    if (mode === "nlu") {
      const res = nluExtract(String(prompt || ""));
      return json({ success: true, mode: "nlu", field: res.field, value: res.value, reply: res.reply });
    }

    // baseline echo (chat)
    return json({ success: true, mode: "chat", reply: `Echo: "${String(prompt)}"` });
  } catch (err: any) {
    return json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
});