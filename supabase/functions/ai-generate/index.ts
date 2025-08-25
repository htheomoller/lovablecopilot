import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/** CORS */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

type Answers = {
  tone?: "ELI5" | "Intermediate" | "Developer";
  idea?: string;
  // future fields: name, audience, features, privacy, auth, etc.
};

type ChatReq = {
  mode?: "chat" | "ping";
  message?: string;
  state?: string | null;
  answers?: Answers | null;
};

type ChatRes = {
  success: true;
  state: string;
  prompt: string;
  answers: Answers;
  ui?: {
    chips?: string[];
    hint?: string;
  };
} | {
  success: false;
  error: string;
};

/** Helpers */
function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(s: string | undefined | null): string {
  return (s ?? "").toString().trim();
}

function normalizeTone(s: string): Answers["tone"] | null {
  const t = s.toLowerCase();
  if (t.includes("explain like i'm 5") || t.includes("explain like im 5") || t === "eli5" || t.includes("very simple") || t === "simple") return "ELI5";
  if (t.includes("intermediate") || t.includes("normal")) return "Intermediate";
  if (t.includes("developer") || t.includes("dev") || t.includes("technical")) return "Developer";
  return null;
}

/** Prompts by state */
function promptFor(state: string, answers: Answers): { prompt: string; chips?: string[]; hint?: string } {
  switch (state) {
    case "ASK_TONE":
      return {
        prompt: "How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.",
        chips: ["Explain like I'm 5", "Intermediate", "Developer"],
      };
    case "ASK_IDEA":
      return {
        prompt: "What's your app idea in one short line?",
        chips: ["Photo restoration app", "Task manager", "AI assistant for builders"],
        hint: "Keep it short — one sentence is perfect.",
      };
    default:
      return { prompt: "What's next?" };
  }
}

/** Next-state engine (minimal for now: tone → idea) */
function advance(state: string, message: string, answers: Answers): { state: string; answers: Answers; understood: boolean } {
  const msg = normalize(message);
  const current = state || "ASK_TONE";

  if (current === "ASK_TONE") {
    const tone = normalizeTone(msg);
    if (tone) {
      const nextAnswers = { ...answers, tone };
      return { state: "ASK_IDEA", answers: nextAnswers, understood: true };
    }
    return { state: "ASK_TONE", answers, understood: false };
  }

  if (current === "ASK_IDEA") {
    if (msg.length >= 3) {
      const nextAnswers = { ...answers, idea: msg };
      // stop here for now; a later patch can add ASK_AUDIENCE etc.
      return { state: "CONFIRM_SUMMARY", answers: nextAnswers, understood: true };
    }
    return { state: "ASK_IDEA", answers, understood: false };
  }

  // Fallback: keep current state
  return { state: current, answers, understood: false };
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Content-type guard for POST
  if (req.method !== "POST") {
    return json({ success: false, error: "Use POST with JSON" }, { status: 405 });
  }
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return json({ success: false, error: "Expected JSON body" }, { status: 400 });
  }

  try {
    const body = (await req.json()) as ChatReq | null;
    const mode = body?.mode ?? "chat";

    // Health check
    if (mode === "ping") {
      return json({ success: true, mode: "ping", reply: "pong" });
    }

    // Chat flow
    const incomingState = body?.state || "";
    const incomingAnswers: Answers = { ...(body?.answers || {}) };
    const message = normalize(body?.message);

    // Bootstrap state
    const state0 = incomingState || "ASK_TONE";

    // If no message and no answers.tone yet, just ask for tone
    if (!message && state0 === "ASK_TONE" && !incomingAnswers.tone) {
      const p = promptFor("ASK_TONE", incomingAnswers);
      return json({
        success: true,
        state: "ASK_TONE",
        prompt: p.prompt,
        answers: incomingAnswers,
        ui: { chips: p.chips, hint: p.hint },
      } as ChatRes);
    }

    // Advance state machine
    const { state: state1, answers: answers1, understood } = advance(state0, message, incomingAnswers);

    // If we just set tone → move to ASK_IDEA with the right prompt
    if (state1 === "ASK_IDEA") {
      const p = promptFor("ASK_IDEA", answers1);
      return json({
        success: true,
        state: "ASK_IDEA",
        prompt: understood ? `Got it — I'll keep it very ${answers1.tone === "ELI5" ? "simple" : answers1.tone === "Developer" ? "technical" : "clear"}. ${p.prompt}` : promptFor("ASK_TONE", answers1).prompt,
        answers: answers1,
        ui: { chips: p.chips, hint: p.hint },
      } as ChatRes);
    }

    // If idea captured, show a brief summary and stop (later steps can extend this)
    if (state1 === "CONFIRM_SUMMARY") {
      const tone = answers1.tone ?? "ELI5";
      const summary = `Summary so far:\n• Tone: ${tone}\n• Idea: ${answers1.idea}`;
      return json({
        success: true,
        state: "CONFIRM_SUMMARY",
        prompt: `${summary}\nDoes this look right? Say "yes" to continue or type a change.`,
        answers: answers1,
        ui: { chips: ["Yes", "Change tone", "Edit idea"] },
      } as ChatRes);
    }

    // If not understood, repeat the correct question (no dead-end)
    const p = promptFor(state1, answers1);
    const repeat = state1 === "ASK_TONE"
      ? `I didn't catch that tone. Please choose: Explain like I'm 5, Intermediate, or Developer.`
      : `I didn't catch that. ${p.prompt}`;
    return json({
      success: true,
      state: state1,
      prompt: repeat,
      answers: answers1,
      ui: { chips: p.chips, hint: p.hint },
    } as ChatRes);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: msg }, { status: 500 });
  }
});
