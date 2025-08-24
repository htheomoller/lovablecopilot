import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { mode = "chat", prompt = "" } = await req.json();

    // call OpenAI for parsing and replies
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY not set");

    const sys =
      mode === "nlu"
        ? "You are an assistant that extracts structured fields (idea, name, audience, features, privacy, auth, deep_work_hours) from natural language answers. Always return JSON: {field, value, reply}."
        : mode === "roadmap"
        ? "You are a product copilot. Generate a roadmap and 3–4 milestones based on the provided answers."
        : "Be a friendly onboarding companion. Keep the tone conversational.";

    const body = {
      model: "gpt-4o-mini", // affordable but conversational
      messages: [
        { role: "system", content: sys },
        mode === "roadmap"
          ? { role: "user", content: "Answers: " + JSON.stringify(prompt) }
          : { role: "user", content: prompt }
      ],
      max_completion_tokens: 500
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const txt = await r.text();
      return new Response(JSON.stringify({ success: false, error: txt }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const j = await r.json();
    const text = j.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ success: true, mode, reply: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});