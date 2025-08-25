import React from "react";

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
  status: { complete: boolean; missing: Array<keyof Extracted>; next_question: string };
  suggestions: string[];
};

const initialSnapshot: Extracted = {
  tone: null, idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null,
};

export default function Chat() {
  const [endpoint] = React.useState(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`
  );
  const [messages, setMessages] = React.useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [input, setInput] = React.useState("");
  const [snapshot, setSnapshot] = React.useState(initialSnapshot);
  const [chips, setChips] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  async function send(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", prompt: text, snapshot }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.message || "AI error");

      const env: Envelope = {
        reply_to_user: data.reply_to_user,
        extracted: data.extracted,
        status: data.status,
        suggestions: data.suggestions ?? [],
      };

      setMessages((m) => [...m, { role: "assistant", text: env.reply_to_user }]);
      setSnapshot(env.extracted);
      setChips(Array.isArray(env.suggestions) ? env.suggestions.slice(0, 5) : []);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", text: `Error talking to AI: ${e?.message || e}` }]);
    } finally {
      setBusy(false);
    }
  }

  function onChip(c: string) {
    setInput(c);
    void send(c);
    setInput("");
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="text-sm text-muted-foreground">Endpoint: {endpoint}</div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {chips.map((c, i) => (
            <button
              key={i}
              onClick={() => onChip(c)}
              className="px-3 py-1 rounded-full bg-gray-200 hover:bg-gray-300 text-sm"
              disabled={busy}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); const t = input; setInput(""); void send(t); }}
        className="flex gap-2 pt-2"
      >
        <input
          className="flex-1 border rounded-lg px-3 py-2"
          placeholder="Type your message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50" disabled={busy}>Send</button>
      </form>

      <div className="text-xs text-gray-400">Answers: {JSON.stringify(snapshot)}</div>
    </div>
  );
}