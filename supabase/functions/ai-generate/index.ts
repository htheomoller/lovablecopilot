import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// --- SAFE DEFAULTS -----------------------------------------------------------
const DEFAULT_EXTRACTOR_PROMPT = `
You are Lovable Copilot for onboarding. Converse warmly. Extract fields incrementally.
Return ONLY a single JSON object with keys:
reply_to_user (string),
extracted { tone: 'eli5'|'intermediate'|'developer'|null, idea: string|null, name: string|null, audience: string|null, features: string[], privacy: 'Private'|'Share via link'|'Public'|null, auth: 'Google OAuth'|'Magic email link'|'None (dev only)'|null, deep_work_hours: '0.5'|'1'|'2'|'4+'|null },
status { complete: boolean, missing: string[], next_question: string },
suggestions: string[]
Never include trailing commas. Never add extra text outside JSON.
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
