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
    const { prompt = "", mode = "nlu", answers = {} } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

    const system = mode === "nlu"
      ? `You are a helpful onboarding assistant. Classify the user message into one of these fields: idea, name, audience, features (array, comma separated), privacy, auth, deep_work_hours. Always return a JSON object with { field, value, reply }. reply should be a short, friendly reflection back to the user.`
      : `You are a friendly copilot. Reply naturally and concisely.`;

    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_schema", json_schema: {
        name: "classification",
        schema: {
          type: "object",
          properties: {
            field: { type: "string" },
            value: {},
            reply: { type: "string" }
          },
          required: ["field","value","reply"]
        }
      }}
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const j = await r.json();
    const content = j.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : { reply: "Sorry, I didn't get that." };

    return new Response(JSON.stringify({ success: true, mode, ...parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});