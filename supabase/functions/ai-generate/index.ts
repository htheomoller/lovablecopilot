import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.57.0";
import { SYSTEM_PROMPT, type Extracted, type Envelope } from "./prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

type ChatRequest = {
  mode?: "chat" | "ping";
  prompt?: string;              // legacy: latest user message
  snapshot?: Extracted | null;  // legacy: client-side snapshot memory
  messages?: Array<{ role: string; content: string }>;  // new: full conversation history
  answers?: Extracted | null;   // new: authoritative snapshot
  model?: string;               // optional override
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "bad_request", message: "Expected JSON body" }, 400);
  }

  if (body.mode === "ping") return json({ success: true, mode: "ping", reply: "pong" });

  // Handle both legacy and new payload formats
  let userText: string;
  let snapshot: Extracted | null;
  
  if (body.messages && body.answers !== undefined) {
    // New format: extract latest user message from messages array
    const lastUserMsg = body.messages.filter(m => m.role === "user").pop();
    userText = (lastUserMsg?.content ?? "").trim();
    snapshot = body.answers;
  } else {
    // Legacy format
    userText = (body.prompt ?? "").trim();
    snapshot = body.snapshot ?? null;
  }
  
  const model = body.model ?? "gpt-4o-mini";

  if (!userText) {
    return json({ success: false, error: "empty_prompt", message: "Missing user prompt" }, 400);
  }

  const system = { role: "system" as const, content: SYSTEM_PROMPT };
  const user = {
    role: "user" as const,
    content: JSON.stringify({
      user_utterance: userText,
      SNAPSHOT: snapshot,
    }),
  };

  try {
    // Enforce strict JSON object from the model
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [system, user],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    let env: Envelope;
    try {
      env = JSON.parse(text) as Envelope;
    } catch {
      // last-resort extraction of the first {...} block
      const m = text.match(/\{[\s\S]*\}$/);
      if (!m) throw new Error("Model did not return JSON");
      env = JSON.parse(m[0]) as Envelope;
    }

    return json({ success: true, mode: "chat", ...env });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: "upstream_error", message: msg }, 502);
  }
});