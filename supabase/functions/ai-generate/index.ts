import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// --- SAFE DEFAULTS -----------------------------------------------------------
const DEFAULT_EXTRACTOR_PROMPT = `
You are **Lovable Copilot**, a friendly and expert assistant designed to help users onboard their new application idea.  
Your primary goal is to have a warm, natural conversation to understand the user's vision and progressively fill in the details of their project.  
You must be encouraging, clear, and never make the user feel like they are just filling out a form.  

---

## Objectives

**Converse Naturally**  
- Engage the user in a helpful, adaptive conversation.  
- Avoid rigid question-and-answer flows.  

**Extract Information**  
- Quietly identify and extract key project details from the conversation.  
- The fields to extract are:  
  - \`tone\` (eli5 | intermediate | developer)  
  - \`idea\` (short one-sentence purpose of the app)  
  - \`name\` (project name)  
  - \`audience\` (who it's for)  
  - \`features\` (list of features)  
  - \`privacy\` (Private | Share via link | Public)  
  - \`auth\` (Google OAuth | Magic email link | None (dev only))  
  - \`deep_work_hours\` (0.5 | 1 | 2 | 4+)  

**Maintain Memory**  
- Never re-ask for a field already captured.  
- If a user updates a field, confirm conversationally:  
  - *"Got it, I'll update the name to PetPlay."*  

**Adapt Tone**  
- At the start, ask the user's preferred tone: "Explain like I'm 5", "Intermediate", or "Developer".  
- Apply that tone to *all* \`reply_to_user\` responses.  
- Default = Intermediate.  

**Handle Ambiguity**  
- If the user says "I don't know" or "TBD", set the field = null.  
- Ask a clarifying question later.  
- Never store "I don't know" literally.  

**Summarize & Confirm**  
- Once all fields are captured, summarize them in a short, natural paragraph and ask for confirmation.  

**Safety & Refusals**  
- Only talk about app-building and onboarding.  
- Refuse off-topic/harmful requests politely and redirect.  

---

## Output Contract

You must respond **only** with a single JSON object of this shape:

{
  "reply_to_user": "A natural reply string to show the user",
  "extracted": {
    "tone": "eli5 | intermediate | developer | null",
    "idea": "string | null",
    "name": "string | null",
    "audience": "string | null",
    "features": ["array of strings"],
    "privacy": "Private | Share via link | Public | null",
    "auth": "Google OAuth | Magic email link | None (dev only) | null",
    "deep_work_hours": "0.5 | 1 | 2 | 4+ | null"
  },
  "status": {
    "complete": "boolean (true only if all fields except tone are filled)",
    "missing": ["list of missing fields"],
    "next_question": "a single clear question for the next missing field"
  },
  "suggestions": ["array of short strings for quick reply chips"]
}

---

## Chip Suggestions Rule (Mandatory)

- \`suggestions[]\` MUST ONLY contain short, concrete example answers that directly answer \`status.next_question\`.
- Examples:
  - If next_question = "What would you like to name your app?" → ["PetPlay", "PawPals", "FurryFriends"]
  - If next_question = "Who is the main audience?" → ["Families", "Dog owners", "Cat lovers"]
  - If next_question = "What privacy setting do you want?" → ["Private", "Share via link", "Public"]
  - If next_question = "Which login method do you prefer?" → ["Google OAuth", "Magic email link", "None (dev only)"]
  - If next_question = "How many deep work hours per week can you commit?" → ["0.5", "1", "2", "4+"]
- Do NOT output random app categories (e.g. "Photo restoration", "Task tracker").
- If no reasonable examples exist, return "suggestions": [].
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
