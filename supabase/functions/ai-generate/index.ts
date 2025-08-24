import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// -------- CORS (keep simple for now; tighten in prod) --------
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// -------- Helpers --------
async function openAIChat(model: string, messages: any[], maxTokens = 700) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI ${model} error: ${r.status} ${r.statusText} :: ${t}`);
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

function jsonBetween(text: string, fallback: any = null) {
  // grab first {...} or [...] block
  const m = text.match(/[\{\[][^}]*[\}\]]/);
  if (!m) return fallback;
  try { return JSON.parse(m[0]); } catch { return fallback; }
}

// -------- Main handler --------
serve(async (req: Request) => {
  // CORS preflight FIRST
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode = "chat", prompt = "", answer_style = "eli5", answers } = await req.json();

    // ---- MODE: NLU (LLM-based field extraction) ----
    if (mode === "nlu") {
      // System prompt keeps outputs short + structured
      const sys = (
        "You are an onboarding NLU parser. From ONE user message, extract exactly one field from: " +
        "idea, name, audience, features(array), privacy, auth, deep_work_hours. " +
        "Return a SHORT normalized value. ALWAYS reply with a short confirmation sentence " +
        "and THEN a minified JSON object like {\"field\":\"idea\",\"value\":\"...\"}. " +
        "If it looks like a list of features, value must be an array."
      );

      // 1st pass: cheap, chatty
      const primaryModel = "gpt-4o-mini";
      const fallbackModel = "gpt-4.1-mini"; // only if parse fails
      const messages = [
        { role: "system", content: sys },
        { role: "user", content: prompt }
      ];

      let text = await openAIChat(primaryModel, messages, 400);
      let parsed = jsonBetween(text);

      // fallback once if we couldn't parse field/value
      if (!parsed || !parsed.field || (parsed.value === undefined)) {
        text = await openAIChat(fallbackModel, messages, 400);
        parsed = jsonBetween(text);
      }

      let field: string | null = null; let value: any = null;
      if (parsed && parsed.field) { field = parsed.field; value = parsed.value; }

      // very small guardrails/normalization
      if (field === "features" && typeof value === "string") {
        value = value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0,6);
      }

      const reply = text || "Got it.";
      return new Response(
        JSON.stringify({ success: true, mode: "nlu", field, value, reply }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- MODE: ROADMAP (summarize answers + propose milestones) ----
    if (mode === "roadmap") {
      const sys = (
        "You are a product copilot. Given ANSWERS (JSON), produce a concise roadmap. " +
        "Start with a friendly summary paragraph. Then list 3-5 milestones. " +
        "Also include a final JSON array named milestones with objects: " +
        "[{\"name\":\"...\",\"description\":\"...\",\"duration_days\":N}] so the app can parse it."
      );
      const text = await openAIChat("gpt-4o-mini", [
        { role: "system", content: sys },
        { role: "user", content: `ANSWERS: ${JSON.stringify(answers || {})}` }
      ], 900);

      const milestones = jsonBetween(text, []);
      return new Response(
        JSON.stringify({ success: true, mode: "roadmap", reply: text, milestones }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- MODE: CHAT (light helper small-talk) ----
    const sysChat = (
      "Be a succinct, friendly copilot. Keep answers short. If the user looks like " +
      "they're answering a required onboarding field, encourage them to continue."
    );
    const text = await openAIChat("gpt-4o-mini", [
      { role: "system", content: sysChat },
      { role: "user", content: prompt }
    ], 400);

    return new Response(
      JSON.stringify({ success: true, mode: "chat", reply: text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
