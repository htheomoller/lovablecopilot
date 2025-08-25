/**
 * Chat UI – dedupe questions & show chips tied to env.status.next_question
 * Key fixes:
 *   • Only one question bubble per turn (taken from env.status.next_question).
 *   • reply_to_user never contains a question; we render it as a statement.
 *   • Chips are rendered under the current question from env.suggestions only.
 *   • Basic guard against duplicate question rendering.
 *   • In-flight flag prevents double sends.
 */
import React from "react";

type Role = "user" | "assistant" | "system";
type Msg = { role: Role; text: string; ts: number };

type Extracted = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};
type Status = {
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
type Envelope = {
  reply_to_user: string;
  extracted: Extracted;
  status: Status;
  suggestions: string[];
};

export default function Chat() {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [answers, setAnswers] = React.useState({
    tone: null,
    idea: null,
    name: null,
    audience: null,
    features: [],
    privacy: null,
    auth: null,
    deep_work_hours: null,
  });
  const [question, setQuestion] = React.useState<string | null>(null);
  const [chips, setChips] = React.useState<string[]>([]);
  const lastQuestionRef = React.useRef<string | null>(null);
  const inFlightRef = React.useRef(false);

  // initial system message
  React.useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text:
          "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.",
        ts: Date.now(),
      },
    ]);
  }, []);

  async function send(text: string) {
    if (!text.trim() || inFlightRef.current) return;
    inFlightRef.current = true;

    const userMsg: Msg = { role: "user", text, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", prompt: text, snapshot: answers }),
      });
      const data = await res.json();

      if (!data?.success) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text:
              "Oops, I hit a snag talking to the AI. Please try again in a moment.",
            ts: Date.now(),
          },
        ]);
        inFlightRef.current = false;
        return;
      }

      const env: Envelope = {
        reply_to_user: data.reply_to_user,
        extracted: data.extracted,
        status: data.status,
        suggestions: data.suggestions ?? [],
      };

      // 1) show statement (never a question)
      if (env.reply_to_user && env.reply_to_user.trim()) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: env.reply_to_user.trim(), ts: Date.now() },
        ]);
      }

      // reflect extracted snapshot
      setAnswers(env.extracted);

      // 2) render at most one question (deduped)
      const nextQ = env.status?.next_question ?? null;
      if (nextQ && nextQ !== lastQuestionRef.current) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: nextQ, ts: Date.now() },
        ]);
        setQuestion(nextQ);
        lastQuestionRef.current = nextQ;
      } else if (!nextQ) {
        setQuestion(null);
      }

      // 3) chips tied only to the current next_question
      setChips(env.suggestions ?? []);

      // if complete, show a tiny confirmation
      if (env.status?.complete) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text:
              "Nice! I have everything I need. Want me to compile a summary for your approval?",
            ts: Date.now(),
          },
        ]);
        setQuestion("Should I compile a summary for approval?");
        setChips(["Yes, show summary", "Not yet"]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Network error reaching the edge function.",
          ts: Date.now(),
        },
      ]);
    } finally {
      inFlightRef.current = false;
    }
  }

  function onChipClick(label: string) {
    setInput("");
    void send(label);
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      <div className="text-xs text-gray-500">
        Answers (debug): {JSON.stringify(answers)}
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div
            key={m.ts + ":" + i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[80%] rounded-2xl px-3 py-2 bg-blue-600 text-white"
                : "mr-auto max-w-[80%] rounded-2xl px-3 py-2 bg-gray-100"
            }
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* Chips under the current question only */}
      {question && chips.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => onChipClick(c)}
              className="px-3 py-1 rounded-full text-sm bg-gray-200 hover:bg-gray-300"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.trim();
          if (v) {
            setInput("");
            void send(v);
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message…"
          className="flex-1 border rounded-xl px-3 py-2"
        />
        <button
          disabled={inFlightRef.current}
          className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}