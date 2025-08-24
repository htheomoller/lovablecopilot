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

    let system = "";
    let responseSchema = {};

    if (mode === "nlu") {
      system = `You are a helpful onboarding assistant. Classify the user message into one of these fields: style, idea, name, audience, features, privacy, auth, deep_work_hours.
      
For each field:
- style: conversation style preference (eli5, intermediate, developer)  
- idea: core app concept
- name: app name (if user says "invent one", generate 3 short creative names, pick the best one)
- audience: target users
- features: key features (array, comma separated)
- privacy: data visibility preference
- auth: authentication method
- deep_work_hours: focused work hours per day

Return JSON with { field, value, shortValue, reply } where:
- value: full captured value
- shortValue: concise 1-liner version
- reply: natural, conversational reflection (not robotic)

If user says "invent one" for name, generate 3 options, pick one, and reply: "Let's go with [NAME] for now. Easy to change later."`;

      responseSchema = {
        name: "classification",
        schema: {
          type: "object",
          properties: {
            field: { type: "string" },
            value: {},
            shortValue: { type: "string" },
            reply: { type: "string" }
          },
          required: ["field", "value", "shortValue", "reply"]
        }
      };
    } else if (mode === "summary") {
      system = `You are a helpful assistant. Take the collected answers and create a concise, friendly summary of the user's project. Make it conversational and clear.`;
      
      responseSchema = {
        name: "summary",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            reply: { type: "string" }
          },
          required: ["summary", "reply"]
        }
      };
    } else if (mode === "roadmap") {
      system = `You are a helpful project assistant. Create a conversational roadmap with 3-4 practical steps for building the user's app. Keep it friendly and actionable.`;
      
      responseSchema = {
        name: "roadmap",
        schema: {
          type: "object",
          properties: {
            roadmap: { type: "string" },
            reply: { type: "string" }
          },
          required: ["roadmap", "reply"]
        }
      };
    } else {
      system = `You are a friendly copilot. Reply naturally and concisely.`;
      responseSchema = {
        name: "general",
        schema: {
          type: "object",
          properties: {
            reply: { type: "string" }
          },
          required: ["reply"]
        }
      };
    }

    const messages = [
      { role: "system", content: system },
      { role: "user", content: mode === "summary" || mode === "roadmap" ? JSON.stringify(answers) : prompt }
    ];

    const body = {
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_schema", json_schema: responseSchema }
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