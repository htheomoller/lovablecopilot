import React, { useState } from "react";
import { callEdgeEcho } from "@/lib/edge";

type Msg = { role: "user" | "assistant"; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Hi! Type anything and I will echo it from the edge function.", ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const say = input.trim();
    if (!say || busy) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: say, ts: Date.now() }]);
    setBusy(true);
    try {
      const data = await callEdgeEcho(say);
      const reply = data?.reply ?? "No reply.";
      setMessages(m => [...m, { role: "assistant", text: reply, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: "assistant", text: `Error: ${err.message || err}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chat with AI</h1>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80">
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded ${m.role === "user" ? "bg-blue-50" : "bg-gray-50"}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground">…calling edge</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={send} className="px-3 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50" disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}