import { useEffect, useRef, useState } from "react";
import { callEdge, edgeInfo } from "@/lib/ai";

type Msg = { role: "assistant" | "user" | "system"; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<{ endpoint?: string; last?: any } | null>(null);

  useEffect(() => {
    const { endpoint, hasKeys } = edgeInfo();
    const intro = `Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.`;
    const ep = `Endpoint: ${endpoint}${hasKeys ? "" : " (⚠️ missing env keys)"}`;
    setMessages([
      { role: "assistant", text: intro, ts: Date.now() },
      { role: "assistant", text: ep, ts: Date.now() + 1 },
    ]);
  }, []);

  async function pingEdge() {
    setBusy(true);
    const res = await callEdge("ping", "ping");
    setBusy(false);
    setDebug({ endpoint: res.endpoint, last: res });
    setMessages(m => [
      ...m,
      { role: "assistant", text: `Ping → ${res.success ? "ok:true" : "ok:false"} status:${res.status ?? "?"} ${res.raw ? `reply:${res.raw}` : res.error}`, ts: Date.now() },
    ]);
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: say, ts: Date.now() }]);

    setBusy(true);
    const res = await callEdge(say, "chat");
    setBusy(false);
    setDebug({ endpoint: res.endpoint, last: res });

    if (!res.success) {
      setMessages(m => [
        ...m,
        { role: "assistant", text: `Error talking to edge: ${res.error}${res.status ? ` (status ${res.status})` : ""}${res.raw ? `:\n${res.raw}` : ""}`, ts: Date.now() },
      ]);
      return;
    }

    // Prefer structured reply, but fall back to raw if missing
    const reply = typeof res.reply === "string" ? res.reply : res.raw ?? "No reply from edge.";
    setMessages(m => [...m, { role: "assistant", text: reply, ts: Date.now() }]);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <button className="px-3 py-1 border rounded" onClick={() => location.reload()}>Refresh</button>
        <button className="px-3 py-1 border rounded" onClick={() => { setMessages([]); location.reload(); }}>Reset</button>
        <button className="px-3 py-1 border rounded" onClick={pingEdge} disabled={busy}>{busy ? "Pinging…" : "Ping Edge"}</button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "bg-blue-50 p-2 rounded" : "bg-gray-50 p-2 rounded"}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 border rounded"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => (e.key === "Enter" ? send() : undefined)}
          placeholder="Type your message…"
        />
        <button className="px-3 py-2 border rounded" onClick={send} disabled={busy}>Send</button>
      </div>

      {/* tiny debug footer */}
      <div className="text-xs text-gray-500 whitespace-pre-wrap">
        {debug?.endpoint ? `Endpoint: ${debug.endpoint}` : null}
        {debug?.last ? `\nLast: ${JSON.stringify(debug.last)}` : null}
      </div>
    </div>
  );
}