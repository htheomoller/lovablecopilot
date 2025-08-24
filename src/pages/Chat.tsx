import React, { useEffect, useState } from "react";
import { pingEdge, callEdge } from "@/lib/ai";

type Msg = { role: "user" | "assistant" | "system"; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastPing, setLastPing] = useState<string>("");

  useEffect(() => {
    setMessages([{
      role: "assistant",
      text: "Hi — let's get started building your idea! I'm wired to an edge function. Use \"Ping Edge\" to verify it returns JSON. Then say ELI5, Intermediate, or Developer to begin.",
      ts: Date.now()
    }]);
  }, []);

  async function onPing() {
    try {
      setBusy(true);
      const data = await pingEdge();
      setLastPing(JSON.stringify(data));
      setMessages(m => [...m, { role: "assistant", text: `Ping → ${JSON.stringify(data)}`, ts: Date.now() }]);
    } catch (err: any) {
      const msg = `Ping error: ${err?.message || String(err)}`;
      setLastPing(msg);
      setMessages(m => [...m, { role: "assistant", text: msg, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: say, ts: Date.now() }]);

    try {
      setBusy(true);
      const data = await callEdge({ mode: "chat", prompt: say });
      setMessages(m => [...m, { role: "assistant", text: (data as any)?.reply ?? JSON.stringify(data), ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: "assistant", text: `Error talking to edge: ${err?.message || String(err)}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1 rounded border"
        >
          Refresh
        </button>
        <button
          onClick={onPing}
          className="px-3 py-1 rounded border"
          disabled={busy}
        >
          Ping Edge
        </button>
        {busy && <span>…thinking</span>}
      </div>

      <div className="text-xs text-muted-foreground">
        {lastPing ? `Last ping: ${lastPing}` : "No ping yet."}
      </div>

      <div className="space-y-2 border rounded p-3 min-h-[200px] bg-background">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span className="whitespace-pre-wrap">{m.text}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => (e.key === "Enter" ? send() : null)}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={send} className="px-3 py-2 border rounded" disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}