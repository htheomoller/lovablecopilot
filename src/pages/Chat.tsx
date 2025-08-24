import React, { useEffect, useState } from "react";
import { callEdge, pingEdge } from "@/lib/ai";

type Msg = { role: "user" | "assistant"; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ping, setPing] = useState<string>("");

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text:
          "Hi — let's get started building your idea! I'll ask a few quick questions so I can understand what you want to make. " +
          "First, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer.",
        ts: Date.now(),
      },
    ]);
  }, []);

  async function doPing() {
    try {
      const r = await pingEdge();
      setPing(r);
      setMessages(m => [...m, { role: "assistant", text: `Edge ping: ${r}`, ts: Date.now() }]);
    } catch (e:any) {
      const msg = `Ping failed: ${e?.message || e}`;
      setPing(msg);
      setMessages(m => [...m, { role: "assistant", text: msg, ts: Date.now() }]);
    }
  }

  async function onSend() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: say, ts: Date.now() }]);
    try {
      setBusy(true);
      const data = await callEdge({ mode: "chat", prompt: say });
      const reply = (data as any)?.reply ?? "No reply.";
      setMessages(m => [...m, { role: "assistant", text: reply, ts: Date.now() }]);
    } catch (e:any) {
      setMessages(m => [...m, { role: "assistant", text: `Error talking to edge: ${e?.message || e}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => window.location.reload()} className="px-3 py-1 rounded border">Refresh</button>
        <button onClick={doPing} className="px-3 py-1 rounded border">Ping Edge</button>
        {ping && <span className="text-sm opacity-70">Last ping: {ping}</span>}
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={"inline-block px-3 py-2 rounded " + (m.role === "user" ? "bg-blue-100" : "bg-gray-100")}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm opacity-70">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => (e.key === "Enter" ? onSend() : null)}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={onSend} className="px-3 py-2 rounded border">Send</button>
      </div>
    </div>
  );
}