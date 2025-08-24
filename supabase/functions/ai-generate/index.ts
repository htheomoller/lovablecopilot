import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// OpenAI call
async function callOpenAI(prompt: string, system: string, model = "gpt-4o-mini") {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ],
    temperature: 0.7
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const j = await res.json();
  return j.choices[0].message.content.trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { mode = "chat", prompt = "", answers = {} } = await req.json();
    if (!prompt) throw new Error("Missing prompt");

    let systemPrompt = "";
    if (mode === "nlu") {
      systemPrompt = `You are a project onboarding assistant.
Extract structured fields from the user's reply.
Fields: idea, name, audience, features, privacy, auth, deep_work_hours.
Return clean JSON: {field, value, reply}.
Reply is a short, natural reflection back to the user.`;
    } else if (mode === "roadmap") {
      systemPrompt = `You are a roadmap generator. Based on collected answers, draft a short roadmap.
Keep it concise, actionable, and user-friendly.`;
    } else {
      systemPrompt = `You are a friendly chat companion guiding users through building their project idea.
Keep answers conversational, short, and supportive.
When enough info is collected, suggest confirming answers before generating a roadmap.`;
    }

    const reply = await callOpenAI(prompt, systemPrompt);

    // If NLU, parse JSON
    if (mode === "nlu") {
      try {
        const parsed = JSON.parse(reply);
        return new Response(JSON.stringify({ success: true, mode, ...parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch {
        return new Response(JSON.stringify({ success: true, mode, reply }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ success: true, mode, reply }), {
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