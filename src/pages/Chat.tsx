import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Envelope, EdgeReply } from "@/lib/copilotTypes";

const EDGE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL?.replace(/\/+$/, "") +
  "/functions/v1/ai-generate";

type Msg = { role: "assistant" | "user" | "meta"; text: string; ts: number };

const initialAssistant =
  "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.";

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: initialAssistant, ts: Date.now() },
  ]);
  const [answers, setAnswers] = useState<Partial<Envelope["extracted"]>>({});
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [lastEnv, setLastEnv] = useState<Envelope | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Chips come from the last envelope suggestions
  const chips = useMemo(() => lastEnv?.suggestions ?? [], [lastEnv]);

  async function pingEdge() {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ping" }),
    }).catch(() => null);
    const ok = !!res && res.ok;
    const text = ok ? await res!.text() : "Ping error";
    setMessages((m) => [
      ...m,
      { role: "meta", text: `Endpoint: ${EDGE_URL} Ping → ${text}`, ts: Date.now() },
    ]);
  }

  useEffect(() => {
    // show next question as placeholder (avoid double-asking in bubbles)
    if (lastEnv?.status?.next_question) {
      inputRef.current?.setAttribute("placeholder", lastEnv.status.next_question);
    }
  }, [lastEnv?.status?.next_question]);

  async function sendText(s: string) {
    if (!s.trim() || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: s, ts: Date.now() }]);
    setPending(true);

    try {
      const res = await fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", prompt: s }),
      });
      const data = (await res.json()) as EdgeReply;
      if (!("success" in data) || !data.success) {
        const msg = (data as any)?.message || "edge error";
        setMessages((m) => [...m, { role: "meta", text: `Error: ${msg}`, ts: Date.now() }]);
        return;
      }
      if (data.mode === "ping") {
        setMessages((m) => [
          ...m,
          { role: "meta", text: `Ping → ${JSON.stringify(data)}`, ts: Date.now() },
        ]);
        return;
      }
      // CHAT
      const env = data.envelope;
      setLastEnv(env);

      // show conversational reply only (no extra question bubble)
      setMessages((m) => [...m, { role: "assistant", text: env.reply_to_user, ts: Date.now() }]);

      // reflect extracted snapshot
      setAnswers(env.extracted);
      try {
        localStorage.setItem("cp_answers_v2", JSON.stringify(env.extracted));
      } catch {}

      // if complete, add closing prompt
      if (env.status.complete) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text:
              "I've got everything I need. Would you like me to draft the roadmap now, or review the summary first?",
            ts: Date.now(),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { role: "meta", text: `Error talking to AI: ${err?.message || "unknown"}`, ts: Date.now() },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <button onClick={() => window.location.reload()} className="px-3 py-1 border rounded">
          Refresh
        </button>
        <button
          onClick={() => {
            setMessages([{ role: "assistant", text: initialAssistant, ts: Date.now() }]);
            setLastEnv(null);
            setAnswers({});
          }}
          className="px-3 py-1 border rounded"
        >
          Reset
        </button>
        <button onClick={pingEdge} className="px-3 py-1 border rounded">
          Ping Edge
        </button>
      </div>

      {/* Chips row — from last suggestions */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <button
              key={i}
              className="px-3 py-1 rounded-full border hover:bg-gray-50"
              onClick={() => sendText(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="space-y-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[80%] bg-blue-600 text-white px-3 py-2 rounded-2xl"
                : m.role === "assistant"
                ? "max-w-[80%] bg-gray-100 px-3 py-2 rounded-2xl"
                : "text-xs text-gray-500"
            }
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* Answers snapshot */}
      <div className="text-xs text-gray-500">
        Answers: {JSON.stringify(answers)}
      </div>

      {/* Composer */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? sendText(input) : undefined)}
          placeholder="Type your message…"
          className="flex-1 border rounded px-3 py-2"
        />
        <button
          disabled={pending}
          onClick={() => sendText(input)}
          className="px-3 py-2 border rounded"
        >
          {pending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}