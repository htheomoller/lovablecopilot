import React, { useEffect, useMemo, useRef, useState } from "react";

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

type Envelope = {
  reply_to_user: string;
  extracted: Extracted;
  status: {
    complete: boolean;
    missing: string[];
    next_question: string;
  };
  suggestions: string[];
};

const initialExtracted: Extracted = {
  tone: null, idea: null, name: null, audience: null,
  features: [], privacy: null, auth: null, deep_work_hours: null
};

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with Ping Edge. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.", ts: Date.now() }
  ]);
  const [answers, setAnswers] = useState<Extracted>(initialExtracted);
  const [chips, setChips] = useState<string[]>([]);
  const [endpoint] = useState<string>(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // Helper: push a message
  const push = (role: Role, text: string) =>
    setMessages(m => [...m, { role, text, ts: Date.now() }]);

  // Send chat to edge
  const ask = async (userText: string) => {
    if (!userText.trim()) return;
    push("user", userText);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          // full history for style + continuity
          messages: messages.concat([{ role: "user", text: userText, ts: Date.now() }]).map(m => ({ role: m.role, content: m.text })),
          // authoritative snapshot the model must respect
          answers
        })
      });

      const data = await res.json() as Envelope | { success?: boolean; error?: string; message?: string };
      // Defensive: if wrapped, unwrap
      const env: Envelope = (data as any).reply_to_user
        ? data as Envelope
        : (data as any).envelope;

      if (!env || !env.reply_to_user) {
        throw new Error("Invalid AI envelope");
      }

      // Render exactly one assistant bubble: reply_to_user
      push("assistant", env.reply_to_user);

      // Update memory snapshot + chips
      setAnswers(env.extracted ?? answers);
      setChips(Array.isArray(env.suggestions) ? env.suggestions.slice(0, 6) : []);

    } catch (err: any) {
      push("assistant", `Sorry — I hit an error talking to AI: ${err?.message ?? String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  // Chip click becomes exact user message
  const onChip = (s: string) => ask(s);

  // Submit
  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!inputRef.current) return;
    const v = inputRef.current.value;
    inputRef.current.value = "";
    ask(v);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      <div className="text-xs text-gray-500">Endpoint: {endpoint}</div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block rounded-2xl px-4 py-2 ${m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"}`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, idx) => (
            <button
              key={idx}
              onClick={() => onChip(c)}
              className="rounded-full border px-3 py-1 text-sm hover:bg-gray-50"
              disabled={busy}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex gap-2 pt-2">
        <input
          ref={inputRef}
          disabled={busy}
          placeholder="Type your message…"
          className="flex-1 rounded-md border px-3 py-2"
        />
        <button className="rounded-md bg-black text-white px-4 py-2" disabled={busy}>Send</button>
      </form>

      <details className="text-xs text-gray-500 pt-2">
        <summary>Answers (debug)</summary>
        <pre className="whitespace-pre-wrap">{JSON.stringify(answers, null, 2)}</pre>
      </details>
    </div>
  );
}