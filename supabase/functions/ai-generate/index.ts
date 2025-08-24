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
    const { prompt = "", mode = "nlu", answers = {}, field = "", context = "" } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

    let system = "";
    let responseSchema = {};

    if (mode === "nlu") {
      if (field === "style") {
        system = `You are a friendly onboarding assistant. The user is answering what conversation style they prefer. Extract their preference (eli5, intermediate, or developer) and respond naturally. If they say something like "not technical" or "simple", map to eli5. Return { field: "style", value: [extracted style], shortValue: [style], reply: [natural confirmation] }`;
      } else if (field === "name_suggest") {
        system = `You are a creative assistant. Generate ONE relevant, project-related app name based on the idea: "${context}". Make it short, memorable, and related to the concept. Return { field: "name", value: [generated name], shortValue: [generated name], reply: "Let's go with [NAME] for now. Easy to change later." }`;
      } else if (field === "audience") {
        system = `You are a helpful assistant. Take the user's description of their target audience and summarize it into one clean, concise line. Return { field: "audience", value: [original], shortValue: [clean summary], reply: [natural reflection asking for confirmation] }`;
      } else if (field === "features") {
        system = `You are a helpful assistant. Extract the key features from the user's description into a structured list. Categorize if possible (Core, Monetization, etc.). Return { field: "features", value: [array of features], shortValue: [comma-separated list], reply: [natural reflection showing categories, asking for confirmation] }`;
      } else {
        // General field capture
        system = `You are a helpful onboarding assistant. Classify and extract the user's response for the field: ${field}. Return JSON with { field: "${field}", value: [extracted value], shortValue: [concise version], reply: [natural, conversational reflection] }`;
      }

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
      system = `You are a helpful assistant. Take the collected answers and create a structured summary. Format as:
      
Idea: [idea]
Name: [name]  
Audience: [audience]
Features: [features]
Privacy: [privacy]
Auth: [auth]
Deep Work Hours: [deep_work_hours]

Then ask: "Does this look right? Want to edit anything?"`;
      
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
      system = `You are a helpful project assistant. Create a conversational roadmap with 3-4 practical steps for building the user's app based on their answers. Keep it friendly and actionable. End by asking: "Want me to revise or adjust anything?"`;
      
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
      system = `You are a friendly copilot. Reply naturally and conversationally.`;
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