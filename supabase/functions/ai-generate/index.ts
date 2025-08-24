import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** CORS */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten in prod
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

/** Helpers */
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}), ...corsHeaders },
  });

/** Tiny safer getter */
const getEnv = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

serve(async (req: Request) => {
  // CORS preflight first
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode = "chat", prompt = "", answer_style = "eli5", answers = {} } =
      (await req.json().catch(() => ({}))) as {
        mode?: "ping" | "chat" | "nlu" | "roadmap";
        prompt?: string;
        answer_style?: "eli5" | "intermediate" | "developer";
        answers?: Record<string, unknown>;
      };

    // Health
    if (mode === "ping") return json({ success: true, mode: "ping", reply: "pong" });

    // Use OpenAI for chat/nlu/roadmap
    const OPENAI_API_KEY = getEnv("OPENAI_API_KEY");

    // Build request
    const mkChat = (system: string, user: string) => ({
      model: "gpt-4.1-mini-2025-04-14",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: 600,
    });

    if (mode === "chat") {
      const sys =
        "You are Copilot, a warm, succinct assistant. Be conversational, helpful, and concrete. Prefer short paragraphs and bullet points.";
      const body = mkChat(sys, prompt);

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) return json({ success: false, error: "openai_error", status: r.status }, { status: 502 });
      const j = await r.json();
      const reply = j?.choices?.[0]?.message?.content ?? "";
      return json({ success: true, mode: "chat", reply });
    }

    if (mode === "nlu") {
      const sys =
        "Extract ONE field from the user's line for product onboarding. Allowed fields: idea, name, audience, features (array), privacy, auth, deep_work_hours. Respond ONLY as JSON like {\"field\":\"idea\",\"value\":\"...\"}. Keep value short, normalized, one line. If unsure, choose the most likely field based on context of the sentence.";
      const body = mkChat(sys, prompt);

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) return json({ success: false, error: "openai_error", status: r.status }, { status: 502 });
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content ?? "";

      // Try strict JSON first
      let obj: any = null;
      try {
        obj = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            obj = JSON.parse(m[0]);
          } catch {
            /* swallow */
          }
        }
      }

      if (!obj || !obj.field) {
        return json({
          success: true,
          mode: "nlu",
          field: null,
          value: null,
          reply: "Thanks — could you say that in one short line?",
        });
      }

      const valueStr = Array.isArray(obj.value) ? obj.value.join(", ") : String(obj.value ?? "");
      return json({
        success: true,
        mode: "nlu",
        field: obj.field,
        value: obj.value,
        reply: `Got it: **${obj.field}** → "${valueStr}".`,
      });
    }

    if (mode === "roadmap") {
      const sys =
        "You are a product copilot. Given structured answers, produce a compact roadmap (3–4 milestones, each a sentence). Keep it crisp.";
      const body = mkChat(sys, `Answers JSON: ${JSON.stringify(answers)}\nExplain for: ${answer_style}`);

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) return json({ success: false, error: "openai_error", status: r.status }, { status: 502 });
      const j = await r.json();
      const reply = j?.choices?.[0]?.message?.content ?? "";
      return json({ success: true, mode: "roadmap", reply, milestones: [] });
    }

    // Default
    return json({ success: true, mode: "chat", reply: `Baseline echo: "${prompt}"` });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: msg }, { status: 500 });
  }
});