import React, { useEffect, useState } from "react";
import { callEdge } from "@/lib/ai";

type Msg = { role: "assistant" | "user" | "system"; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text:
          "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. " +
          "How should I talk to you? Say: ELI5 (very simple), Intermediate, or Developer.",
        ts: Date.now()
      }
    ]);
  }, []);

  async function onSend() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: say, ts: Date.now() }]);

    try {
      setBusy(true);
      const data = await callEdge(say, "chat");
      const reply = data?.reply ?? "No reply.";
      setMessages((m) => [...m, { role: "assistant", text: reply, ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Error talking to edge: ${e?.message || e}`, ts: Date.now() }
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function onPing() {
    try {
      setBusy(true);
      const data = await callEdge("ping", "ping");
      const reply = JSON.stringify(data);
      setMessages((m) => [...m, { role: "assistant", text: `Ping → ${reply}`, ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Ping error: ${e?.message || e}`, ts: Date.now() }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1 bg-secondary text-secondary-foreground rounded"
        >
          Refresh
        </button>
        <button
          onClick={onPing}
          className="px-3 py-1 bg-primary text-primary-foreground rounded"
        >
          Ping Edge
        </button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className="inline-block px-3 py-2 rounded bg-muted">{m.text}</div>
          </div>
        ))}
        {busy && <div className="text-sm opacity-70">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? onSend() : undefined)}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={onSend} className="px-3 py-2 rounded bg-primary text-primary-foreground">
          Send
        </button>
      </div>
    </div>
  );
}