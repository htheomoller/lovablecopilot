import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// --- SAFE DEFAULTS -----------------------------------------------------------
const DEFAULT_EXTRACTOR_PROMPT = `
You are Lovable Copilot, a friendly and expert assistant designed to help users onboard their new application idea. Your primary goal is to have a warm, natural conversation to understand the user's vision and progressively fill in the details of their project. You must be encouraging, clear, and never make the user feel like they are just filling out a form.

## Objectives

- **Converse Naturally**: Engage the user in a helpful, adaptive conversation. Avoid rigid question-and-answer flows. 
- **Extract Information**: Quietly identify and extract key project details. Fields to extract:
  - tone: "eli5" | "intermediate" | "developer" | null
  - idea: one-sentence app purpose | null
  - name: project name | null
  - audience: target users | null
  - features: list of strings | []
  - privacy: "Private" | "Share via link" | "Public" | null
  - auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null
  - deep_work_hours: "0.5" | "1" | "2" | "4+" | null
- **Maintain Memory**: Never re-ask for a field already filled. If a user changes a value, confirm the change conversationally.
- **Handle Ambiguity**: If the answer is vague or "I don't know yet", store null and return to it later.
- **Summarize & Confirm**: When all fields are filled, provide a summary and ask for confirmation.
- **Safety**: Refuse out-of-scope or harmful topics and gently redirect.

## Critical Rule for Suggestions (Quick-Reply Chips)

- \`suggestions[]\` MUST ONLY contain **short, user-selectable example answers relevant to \`status.next_question\`**.
- They MUST NOT contain advice, instructions, or open-ended prompts.
- Examples:
  - If next_question = "Who is the main audience?", suggestions = ["Families", "Photographers", "Everyone"].
  - If next_question = "What privacy setting do you want?", suggestions = ["Private", "Share via link", "Public"].
  - If no good examples exist, return \`"suggestions": []\`.

## Output Contract

You MUST ALWAYS and ONLY output a single valid JSON object:

{
  "reply_to_user": "Conversational reply to display in the chat.",
  "extracted": { ... all fields ... },
  "status": {
    "complete": boolean,
    "missing": [list of still-missing fields],
    "next_question": "A single friendly question aimed at the next missing field"
  },
  "suggestions": [array of short example answers relevant to next_question]
}
`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function callOpenAI(messages: Array<{role:"system"|"user"|"assistant", content:string}>, model = (Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini")) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("missing_openai_key");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.2, messages })
  });
  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`openai_http_${r.status}:${t}`);
  }
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return content;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Content-type guard
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return json({ success:false, error:"bad_request", message:"Expected application/json body" }, 400);

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "chat");
    const prompt = String(body?.prompt || "").trim();

    if (mode === "ping") return json({ success:true, mode:"ping", reply:"pong" });

    // Extractor system prompt (env override → fallback)
    const extractor = Deno.env.get("EXTRACTOR_SYSTEM_PROMPT") || DEFAULT_EXTRACTOR_PROMPT;

    if (mode === "chat") {
      if (!prompt) return json({ success:false, error:"empty_prompt", message:"Prompt is empty" }, 400);

      const systemMsg = { role: "system" as const, content: extractor };
      const userMsg   = { role: "user"   as const, content: prompt };

      let raw = await callOpenAI([systemMsg, userMsg]);
      // If model replied with plain text by mistake, wrap it into the contract
      // Try to parse JSON first
      try {
        const parsed = JSON.parse(raw);
        // Validate minimal shape
        if (parsed && typeof parsed === "object" && parsed.reply_to_user) {
          return json({ success:true, mode:"chat", ...parsed });
        }
      } catch (_) {
        // fall through
      }
      // Coerce into contract when not JSON
      const fallback = {
        reply_to_user: raw || "Thanks! Tell me your idea in one short line.",
        extracted: { tone: null, idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null },
        status: { complete: false, missing: ["idea"], next_question: "What's your app idea in one short line?" },
        suggestions: ["Photo restoration", "Task tracker", "AI coding assistant"]
      };
      return json({ success:true, mode:"chat", ...fallback });
    }

    // Unknown mode
    return json({ success:false, error:"unknown_mode", message:`Unknown mode: ${mode}` }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success:false, error:"upstream_error", message: msg }, 500);
  }
});
