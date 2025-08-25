import React, { useEffect, useRef, useState } from "react";

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

type Envelope = {
  success: boolean;
  mode: "ping" | "chat";
  reply: string;
  extracted?: Extracted | null;
  status?: { complete: boolean; missing: string[]; next_question: string } | null;
  suggestions?: string[];
  raw?: string;
  error?: string;
  message?: string;
};

const EDGE = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/ai-generate";

export default function Chat() {
  const [messages, setMessages] = useState<{ role: "assistant" | "user"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [extracted, setExtracted] = useState<Extracted>({
    tone: null, idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null
  });
  const [chips, setChips] = useState<string[]>([]);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      text: "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer."
    }]);
  }, []);

  async function send(text: string) {
    const say = text.trim();
    if (!say) return;
    setMessages(m => [...m, { role: "user", text: say }]);
    setInput("");

    const res = await fetch(EDGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "chat", prompt: say, context: { tone: extracted.tone } })
    }).catch(() => null);

    if (!res) {
      setMessages(m => [...m, { role: "assistant", text: "Network error calling AI." }]);
      return;
    }
    let data: Envelope | null = null;
    try { data = await res.json(); } catch { data = null; }

    if (!data?.success) {
      setMessages(m => [...m, { role: "assistant", text: `Error talking to AI: ${data?.message || "unknown_error"}` }]);
      return;
    }

    // Render only what server returned (prevents double-questions).
    setMessages(m => [...m, { role: "assistant", text: data!.reply }]);
    if (data?.extracted) setExtracted(prev => ({ ...prev, ...data!.extracted! }));
    setChips(Array.isArray(data?.suggestions) ? data!.suggestions! : []);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <button className="px-3 py-1 rounded border" onClick={() => send("__PING__")}>Ping Edge</button>
        <div className="text-xs text-gray-500">Endpoint: {EDGE}</div>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "assistant" ? "bg-gray-100 rounded p-2" : "bg-blue-50 rounded p-2"}>
            {m.text}
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <button key={i} className="px-3 py-1 rounded-full border" onClick={() => send(c)}>{c}</button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Type your message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" ? send(input) : undefined}
        />
        <button className="px-3 py-2 rounded bg-black text-white" onClick={() => send(input)}>Send</button>
      </div>

      <div className="text-xs text-gray-500 pt-2">
        Answers snapshot: {JSON.stringify(extracted)}
      </div>
    </div>
  );
}