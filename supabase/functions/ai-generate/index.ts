import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * ai-generate (NO heuristics)
 * Modes: nlu | chat | roadmap
 * Returns guaranteed JSON using OpenAI with response_format and a JSON schema.
 * Requires env: OPENAI_API_KEY
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
} as const;

// Allowed keys we normalize into Supabase
const ALLOWED_KEYS = [
  "answer_style", // "eli5" | "intermediate" | "developer"
  "idea",
  "name",
  "audience",
  "features",   // array of strings
  "privacy",    // "Private" | "Share via link" | "Public"
  "auth",       // "Google OAuth" | "Magic email link" | "None (dev only)"
  "deep_work_hours" // "0.5" | "1" | "2" | "4+"
] as const;

type AllowedKey = typeof ALLOWED_KEYS[number];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function pickMissing(answers: Record<string, unknown>): string | "" {
  const order: AllowedKey[] = [
    "answer_style", "idea", "name", "audience", "features", "privacy", "auth", "deep_work_hours"
  ];
  for (const k of order) {
    const v = (answers as any)[k];
    if (v == null || (Array.isArray(v) && v.length === 0) || v === "") return k;
  }
  return "";
}

serve(async (req: Request) => {
  // CORS preflight FIRST
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return jsonResponse({ success: false, error: "OPENAI_API_KEY not set" }, 500);

    const { mode = "chat", prompt = "", style = "intermediate", answers = {} } = await req.json().catch(() => ({ }));

    const model = "gpt-4o-mini"; // fast & economical

    if (mode === "nlu") {
      // Ask OpenAI to interpret user's latest message AND propose a friendly reply.
      const schema = {
        name: "OnboardingNLU",
        schema: {
          type: "object",
          properties: {
            reply: { type: "string", description: "A short, friendly assistant message to show user." },
            kv: {
              type: "object",
              properties: {
                key: { type: "string", enum: [...ALLOWED_KEYS, "none"], description: "Which field to update, or 'none' if not applicable" },
                value: {
                  oneOf: [
                    { type: "string" },
                    { type: "array", items: { type: "string" } },
                    { type: "null" }
                  ],
                  description: "Normalized value for the field. Keep it concise."
                },
                confidence: { type: "number", minimum: 0, maximum: 1 }
              },
              required: ["key", "confidence"]
            },
            next_prompt: { type: "string", description: "Optional follow-up question to ask next." },
            done: { type: "boolean", description: "True if all required fields appear complete now." }
          },
          required: ["reply", "kv"]
        }
      } as const;

      const sys = [
        "You are a product copilot inside an onboarding chat.",
        "Your job: (1) understand the user's latest message in context, (2) produce a friendly, brief reply,",
        "(3) return ONE normalized key/value (kv) to store in a database when appropriate.",
        `Allowed keys: ${ALLOWED_KEYS.join(", ")}. If the message is small-talk or not a direct answer, use key='none'.`,
        "For answer_style: map synonyms → 'eli5' | 'intermediate' | 'developer'.",
        "For features: return a short array of 2–6 concise feature strings if the user lists multiple features.",
        "For name: if user asks for a suggestion, propose ONE short, relevant working name and set kv to that name, but in reply tell them it can be changed later.",
        "Always keep 'value' terse (one line).",
        "Tone: match the requested style (eli5=very simple, intermediate=clear & concise, developer=precise).",
        "NEVER echo the entire conversation."
      ].join("\n");

      const userPayload = {
        role: "user",
        content: JSON.stringify({
          latest_message: prompt,
          current_answers: answers,
          style
        })
      };

      const body = {
        model,
        response_format: { type: "json_schema", json_schema: schema },
        messages: [
          { role: "system", content: sys },
          userPayload
        ]
      } as const;

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!r.ok) return jsonResponse({ success: false, error: "upstream_error", details: await r.text() }, 502);
      const j = await r.json();
      const txt = j.choices?.[0]?.message?.content || "{}";

      let parsed: any;
      try { parsed = JSON.parse(txt); } catch {
        // Last resort: extract first JSON object
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } } else { parsed = {}; }
      }

      // Compute default next prompt if model omitted it
      const missing = pickMissing({ ...answers, ...(parsed?.kv?.key && parsed.kv.key !== "none" ? { [parsed.kv.key]: parsed.kv.value } : {}) });
      const defaultNext = missing === "" ? "Great — I have everything I need. Want me to draft a roadmap? (yes/no)" : (
        missing === "answer_style" ? "How should I talk to you? Say: ELI5, Intermediate, or Developer." :
        missing === "idea" ? "What's your app idea in one short line?" :
        missing === "name" ? "Do you have a name? If not, want a short working name suggestion?" :
        missing === "audience" ? "Who is it for (your ideal user/customer)?" :
        missing === "features" ? "List your top 2–3 must‑have features (comma‑separated)." :
        missing === "privacy" ? "Data visibility: Private, Share via link, or Public?" :
        missing === "auth" ? "Sign‑in: Google OAuth, Magic email link, or None (dev only)?" :
        "Daily focused work hours: 0.5, 1, 2, or 4+?"
      );

      const next_prompt = parsed?.next_prompt || defaultNext;
      const done = missing === "";

      return jsonResponse({ success: true, mode: "nlu", reply: parsed?.reply, kv: parsed?.kv, next_prompt, done });
    }

    if (mode === "roadmap") {
      const schema = {
        name: "RoadmapResult",
        schema: {
          type: "object",
          properties: {
            reply: { type: "string", description: "A friendly summary + roadmap text." },
            milestones: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  duration_days: { type: "number" }
                },
                required: ["name", "duration_days"]
              }
            }
          },
          required: ["reply", "milestones"]
        }
      } as const;

      const sys = [
        "You are a product copilot.",
        "Given the user's normalized answers, produce a concise, encouraging roadmap and 3–5 milestones.",
        "Keep copy tight."
      ].join("\n");

      const body = {
        model,
        response_format: { type: "json_schema", json_schema: schema },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify({ answers, style }) }
        ]
      } as const;

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!r.ok) return jsonResponse({ success: false, error: "upstream_error", details: await r.text() }, 502);
      const j = await r.json();
      const txt = j.choices?.[0]?.message?.content || "{}";
      let parsed: any; try { parsed = JSON.parse(txt); } catch { parsed = { reply: txt, milestones: [] }; }
      return jsonResponse({ success: true, mode: "roadmap", reply: parsed.reply, milestones: parsed.milestones || [] });
    }

    // Fallback simple chat echo (rarely used now)
    return jsonResponse({ success: true, mode: "chat", reply: `Echo: "${prompt}"` });
  } catch (err: any) {
    return jsonResponse({ success: false, error: String(err?.message || err) }, 500);
  }
});