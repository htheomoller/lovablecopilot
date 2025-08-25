import React, { useEffect, useMemo, useRef, useState } from "react";
import { callEdge, type Level } from "@/lib/ai";

type Msg = { role: "assistant" | "user" | "system"; text: string; ts: number };
type Answers = Partial<{
  level: Level;
  idea: string;
  name: string;
  audience: string;
  features: string[];
  privacy: "Private" | "Share via link" | "Public";
  auth: "Google OAuth" | "Magic email link" | "None (dev only)";
}>;

const LEVELS: {label:string; value:Level}[] = [
  { label: "Explain like I'm 5", value: "ELI5" },
  { label: "Intermediate", value: "Intermediate" },
  { label: "Developer", value: "Developer" },
];

const FEATURE_BLURBS = [
  "Generate roadmap", "Draft PRD", "Code health checks", "Setup auth", "Image processing", "Payments",
];

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [answers, setAnswers] = useState<Answers>(() => {
    try { return JSON.parse(localStorage.getItem("cp_answers_v2") || "{}"); } catch { return {}; }
  });
  const [busy, setBusy] = useState(false);

  const transcript = useMemo(
    () => messages.filter(m => m.role !== "system").map(m => ({ role: m.role as "user"|"assistant", content: m.text })),
    [messages]
  );

  useEffect(() => {
    const hello: Msg = {
      role: "assistant",
      ts: Date.now(),
      text: `Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.`,
    };
    setMessages([hello]);
  }, []);

  function setLevel(l: Level) {
    setAnswers(a => {
      const next = { ...a, level: l };
      localStorage.setItem("cp_answers_v2", JSON.stringify(next));
      return next;
    });
    setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Got it — I'll keep it ${l === "ELI5" ? "very simple" : l === "Intermediate" ? "practical" : "technical and concise"}. What's your app idea in one short line?`, }]);
  }

  async function onPing() {
    try {
      const res = await callEdge("", "ping");
      setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Ping → ${JSON.stringify(res)}`, }]);
    } catch (e:any) {
      setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Ping error: ${e.message}`, }]);
    }
  }

  async function sendLine(line?: string) {
    const say = (line ?? input).trim();
    if (!say) return;
    setInput("");
    setMessages(m => [...m, { role: "user", ts: Date.now(), text: say }]);
    setBusy(true);
    try {
      // First: LLM conversation reply (chat)
      const chat = await callEdge(say, "chat", { level: answers.level ?? "ELI5", transcript });
      if (chat?.reply) {
        setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: chat.reply }]);
      }
      // Second: NLU to capture structured fields (no heuristics)
      const nlu = await callEdge(say, "nlu", { level: answers.level ?? "ELI5", answers, transcript });
      const next: Answers = { ...answers, ...(nlu?.fields || {}) };
      setAnswers(next);
      try { localStorage.setItem("cp_answers_v2", JSON.stringify(next)); } catch {}
      // If follow-up exists, ask it (unless chat already covered it)
      if (nlu?.follow_up) {
        setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: nlu.follow_up }]);
      }
    } catch (e:any) {
      setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Error talking to AI: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => window.location.reload()} className="px-3 py-1 rounded border">Refresh</button>
        <button onClick={() => { localStorage.removeItem("cp_answers_v2"); setAnswers({}); setMessages([]); setTimeout(()=>window.location.reload(), 20); }} className="px-3 py-1 rounded border">Reset</button>
        <button onClick={onPing} className="px-3 py-1 rounded border">Ping Edge</button>
      </div>

      {/* Level quick-replies */}
      {!answers.level && (
        <div className="flex flex-wrap gap-2">
          {LEVELS.map(l => (
            <button key={l.value} onClick={() => setLevel(l.value)} className="px-2 py-1 rounded-full border text-sm">
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Feature blurbs */}
      <div className="flex flex-wrap gap-2">
        {FEATURE_BLURBS.map(b => (
          <button
            key={b}
            className="px-2 py-1 rounded-full border text-sm"
            onClick={() => {
              const next = { ...(answers.features ? { features: [...new Set([...(answers.features ?? []), b])] } : { features: [b] }) };
              setAnswers(a => {
                const merged = { ...a, ...next };
                localStorage.setItem("cp_answers_v2", JSON.stringify(merged));
                return merged;
              });
              setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Noted: added feature "${b}". What else?` }]);
            }}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Transcript */}
      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "bg-gray-50 rounded p-2" : "bg-white border rounded p-2"}>
            {m.text}
          </div>
        ))}
        {busy && <div className="text-sm text-gray-500">…thinking</div>}
      </div>

      {/* Compose */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" ? sendLine() : undefined}
          placeholder="Type your message…"
          className="flex-1 border rounded px-3 py-2"
        />
        <button onClick={() => sendLine()} className="px-3 py-2 rounded border">Send</button>
      </div>

      {/* Debug footer */}
      <div className="text-xs text-gray-500 pt-2">
        Answers: {JSON.stringify(answers)}
      </div>
    </div>
  );
}