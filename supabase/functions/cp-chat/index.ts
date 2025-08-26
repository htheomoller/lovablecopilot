/**
 * CP Edge Function: cp-chat
 * Receives a user message and returns a CP JSON envelope.
 * First iteration: single-model (gpt-5), deterministic defaults for code-friendly replies.
 * Schema strictly enforced: returns only valid JSON envelope or a safe error envelope.
 * 
 * Env:
 * - OPENAI_API_KEY (required)
 * - CP_MODEL_DEFAULT (optional, default: gpt-5-2025-08-07)
 * 
 * Notes:
 * - We'll add model routing + usage counters in a later patch (per your instruction).
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type Envelope = {
  success: boolean;
  mode: "chat";
  session_id: string;
  turn_id: string;
  reply_to_user: string;
  confidence: "high" | "medium" | "low";
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
    missing: string[];
    next_question: string | null;
  };
  suggestions: string[];
  error: {
    code: string | null;
    message: string | null;
  };
  meta: {
    conversation_stage: "discovery" | "planning" | "generating" | "refining";
    turn_count: number;
  };
  block: {
    language: "lovable-prompt" | "ts" | "js" | "json" | null;
    content: string | null;
    copy_safe: boolean;
  } | null;
};

type ClientPayload = {
  session_id?: string;
  turn_count?: number;
  user_input: string;
  extracted?: Envelope["extracted"];
  status?: Partial<Envelope["status"]>;
  tone?: "eli5" | "intermediate" | "developer";
};

const CP_MODEL_DEFAULT = Deno.env.get("CP_MODEL_DEFAULT") ?? "gpt-5-2025-08-07";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYS_PROMPT = `
You are CP, a senior developer companion specialized in Lovable projects.
Return ONLY a valid JSON envelope per the schema below. No extra text.

Schema (all required unless noted):
{
  "success": true,
  "mode": "chat",
  "session_id": "uuid-or-client-sent",
  "turn_id": "uuid",
  "reply_to_user": "natural language reply (no code fences, no markdown blocks)",
  "confidence": "high|medium|low",
  "extracted": {
    "tone": "eli5|intermediate|developer|null",
    "idea": "string|null",
    "name": "string|null",
    "audience": "string|null",
    "features": ["…"],
    "privacy": "Private|Share via link|Public|null",
    "auth": "Google OAuth|Magic email link|None (dev only)|null",
    "deep_work_hours": "0.5|1|2|4+|null"
  },
  "status": {
    "complete": false,
    "missing": ["fields still null"],
    "next_question": "One question ONLY if needed, else null"
  },
  "suggestions": ["short, useful quick replies"],
  "error": { "code": null, "message": null },
  "meta": {
    "conversation_stage": "discovery|planning|generating|refining",
    "turn_count": 0
  },
  "block": {
    "language": "lovable-prompt|ts|js|json",
    "content": "copy-safe string or null",
    "copy_safe": true
  } | null
}

Rules:
- One-turn = one question max. Ask nothing if not needed.
- Never repeat a question already answered in 'extracted'.
- If you include code or a Lovable prompt, put it ONLY in block.content and set block.language accordingly. reply_to_user must be prose only.
- If something goes wrong, set success=false and fill error.
- Keep tone from extracted.tone if present; default "developer".
- Default conversation_stage: "planning" unless user asks for code or prompt -> "generating".
- Never include markdown fences or backticks anywhere.
`.trim();

function uuid(): string {
  // Simple UUID v4 generator
  const cryptoAny = crypto as any;
  if (cryptoAny.randomUUID) return cryptoAny.randomUUID();
  const tpl = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return tpl.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeEnvelopeFallback(payload: ClientPayload, message: string): Envelope {
  return {
    success: false,
    mode: "chat",
    session_id: payload.session_id ?? "unknown",
    turn_id: uuid(),
    reply_to_user: "I had trouble processing that. Please rephrase.",
    confidence: "low",
    extracted: {
      tone: payload.tone ?? "developer",
      idea: null,
      name: null,
      audience: null,
      features: [],
      privacy: null,
      auth: null,
      deep_work_hours: null
    },
    status: {
      complete: false,
      missing: [],
      next_question: null
    },
    suggestions: ["Try again", "Rephrase", "Give an example"],
    error: {
      code: "EDGE_FUNCTION_ERROR",
      message
    },
    meta: {
      conversation_stage: "planning",
      turn_count: payload.turn_count ?? 0
    },
    block: null
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { 
      status: 405,
      headers: corsHeaders
    });
  }

  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    return new Response(JSON.stringify(safeEnvelopeFallback({ user_input: "" }, "Missing OPENAI_API_KEY")), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  let payload: ClientPayload;
  try {
    payload = await req.json();
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return new Response(JSON.stringify(safeEnvelopeFallback({ user_input: "" }, "Invalid JSON payload")), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const session_id = payload.session_id ?? uuid();
  const turn_id = uuid();
  const tone = payload.tone ?? (payload.extracted?.tone ?? "developer");
  const userText = (payload.user_input ?? "").toString().slice(0, 8000);

  console.log(`CP Chat - Session: ${session_id}, Turn: ${turn_id}, User: ${userText.substring(0, 100)}...`);

  const messages = [
    { role: "system", content: SYS_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        session_id,
        turn_id,
        tone,
        extracted: payload.extracted ?? null,
        status: payload.status ?? null,
        user_input: userText
      })
    }
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: CP_MODEL_DEFAULT,
        messages,
        max_completion_tokens: 2000,
        top_p: 0.9,
        response_format: { type: "json_object" }
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`OpenAI API error: ${resp.status} ${text}`);
      return new Response(
        JSON.stringify(safeEnvelopeFallback(payload, `OpenAI error: ${resp.status} ${text}`)),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    
    // Validate we got JSON
    let envelope: Envelope | null = null;
    try {
      envelope = JSON.parse(content);
    } catch (parseErr) {
      console.error("Model returned non-JSON content:", content);
      envelope = null;
    }

    if (!envelope || typeof envelope !== "object") {
      return new Response(
        JSON.stringify(safeEnvelopeFallback(payload, "Model returned non-JSON content")),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Minimal schema guardrails: ensure required fields exist with safe defaults
    envelope.mode = "chat";
    envelope.session_id = envelope.session_id || session_id;
    envelope.turn_id = envelope.turn_id || turn_id;
    envelope.success = envelope.success ?? true;
    envelope.confidence = envelope.confidence ?? "high";
    envelope.extracted = envelope.extracted ?? {
      tone: tone as Envelope["extracted"]["tone"],
      idea: null, name: null, audience: null, features: [],
      privacy: null, auth: null, deep_work_hours: null
    };
    envelope.status = envelope.status ?? { complete: false, missing: [], next_question: null };
    envelope.suggestions = envelope.suggestions ?? [];
    envelope.error = envelope.error ?? { code: null, message: null };
    envelope.meta = envelope.meta ?? { conversation_stage: "planning", turn_count: payload.turn_count ?? 0 };
    envelope.block = envelope.block ?? null;

    // Final safety: never allow markdown fences in reply_to_user
    if (typeof envelope.reply_to_user !== "string") {
      envelope.reply_to_user = "I had trouble generating a reply. Please rephrase.";
      envelope.success = false;
      envelope.error = { code: "INVALID_REPLY", message: "reply_to_user missing or not a string" };
    } else {
      envelope.reply_to_user = envelope.reply_to_user.replace(/```/g, "");
    }

    console.log(`CP Chat response - Success: ${envelope.success}, Stage: ${envelope.meta.conversation_stage}`);

    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("CP Chat function error:", err);
    return new Response(JSON.stringify(safeEnvelopeFallback(payload, String(err?.message ?? err))), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});