/**
 * Edge function: ai-generate
 * NOTE: This patch tightens the extractor system prompt so the model never
 * asks duplicate questions. It must put the question ONLY in status.next_question
 * and keep reply_to_user as an acknowledgement/setup line (no question marks).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
} as const;

type Envelope = {
  reply_to_user: string;
  extracted: {
    tone: "eli5" | "intermediate" | "developer" | null;
    idea: string | null;
    name: string | null;
    audience: string | null;
    features: string[];
    privacy: "Private" | "Share via link" | "Public" | null;
    auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
    deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
  };
  status: {
    complete: boolean;
    missing: Array<
      | "tone"
      | "idea"
      | "name"
      | "audience"
      | "features"
      | "privacy"
      | "auth"
      | "deep_work_hours"
    >;
    next_question: string | null;
  };
  suggestions: string[];
};

// — SYSTEM PROMPT (hardened, no duplicate questions) –––––––––––
const SYSTEM_PROMPT = `
You are Lovable Copilot, a warm, concise onboarding assistant.

OBJECTIVES
• Converse naturally but extract project data into the fields below.
• Never re-ask for a field that is already filled unless the user changes it.
• Always acknowledge edits like: "Updated the name to X."
• Default tone to "intermediate" unless the user picks another tone.

FIELDS TO EXTRACT (mirror exactly):
tone: one of eli5 | intermediate | developer | null
idea: one-sentence app description or null
name: project name or null
audience: target users or null
features: string[] or []
privacy: one of Private | Share via link | Public | null
auth: one of Google OAuth | Magic email link | None (dev only) | null
deep_work_hours: one of 0.5 | 1 | 2 | 4+ | null

OUTPUT CONTRACT
Return ONLY a JSON object with:
• reply_to_user: a short, friendly statement that sets context for the next step.
IMPORTANT: If you provide status.next_question, DO NOT include any question
in reply_to_user (no question marks). Keep it as a single sentence like
"Noted the idea; next we'll identify your audience."
• extracted: the current snapshot of fields (never store placeholders like "I don't know").
• status.complete: true only when all fields except tone are filled.
• status.missing: keys still null/empty.
• status.next_question: a single clear question aimed at the MOST IMPORTANT
missing field right now, or null if complete.
• suggestions: 2–5 SHORT options relevant to the next_question ONLY.
Examples:
next_question: "Who is your main audience?"
suggestions: ["Families", "Photographers", "Everyone"]
If no obvious options, return [].

POLICIES
• If user gives a non-answer ("idk", "maybe later"), keep that field null and
move on to a different missing field. Circle back later.
• If user changes a filled field, reflect the change and continue.
• Avoid asking two questions in one turn. Exactly one question lives in
status.next_question; reply_to_user must not contain a question.
`.trim();

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return new Response(
        JSON.stringify({ success: false, error: "Expected JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { mode = "chat", prompt = "", snapshot = null } = await req.json().catch(() => ({
      mode: "chat",
      prompt: "",
      snapshot: null,
    }));

    if (mode === "ping") {
      return new Response(
        JSON.stringify({ success: true, mode, reply: "pong" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call the LLM with snapshot for memory
    const system = { role: "system" as const, content: SYSTEM_PROMPT };
    const user = {
      role: "user" as const,
      content: JSON.stringify({
        user_utterance: prompt,
        SNAPSHOT: snapshot,
      }),
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [system, user],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    let env: Envelope;
    try {
      env = JSON.parse(text);
    } catch {
      // If model emitted prose, wrap it safely to avoid frontend crashes
      env = {
        reply_to_user:
          "I noted that. Next, let's capture your app idea in one sentence.",
        extracted: {
          tone: null,
          idea: null,
          name: null,
          audience: null,
          features: [],
          privacy: null,
          auth: null,
          deep_work_hours: null,
        },
        status: { complete: false, missing: ["idea"], next_question: "What does your app do?" },
        suggestions: ["Photo restoration", "Task tracker", "AI coding assistant"],
      };
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        mode: "chat", 
        reply_to_user: env.reply_to_user,
        extracted: env.extracted,
        status: env.status,
        suggestions: env.suggestions
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});