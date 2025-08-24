import React, { useEffect, useState } from "react";
import { pingEdge, pingHello, callNlu, callChat } from "@/lib/ai";

type ChatMsg = { role: "user"|"assistant"|"system"; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<string>("");

  useEffect(() => {
    setMessages([
      { role: "assistant", ts: Date.now(),
        text: "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: ELI5 (very simple), Intermediate, or Developer." }
    ]);
  }, []);

  async function doPing() {
    setDiag("Pinging ai-generate…");
    const a = await pingEdge();
    if (!a.ok) {
      setDiag(`ai-generate failed: ${a.error ?? a.status}. raw: ${a.raw ?? ""}. Trying /hello…`);
      const h = await pingHello();
      setDiag(`hello → ok:${h.ok} status:${h.status} raw:${h.raw ?? ""}`);
      return;
    }
    setDiag(`ai-generate → ok:${a.ok} status:${a.status} raw:${a.raw ?? ""}`);
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    setMessages(m => [...m, { role:"user", ts: Date.now(), text: say }]);

    // quick style select
    if (/^(eli5|intermediate|developer)$/i.test(say)) {
      const picked = say.toUpperCase();
      setMessages(m => [...m, { role:"assistant", ts: Date.now(), text: `Got it — I'll keep it ${picked === "ELI5" ? "very simple" : picked.toLowerCase()}. What's your app idea in one short line?` }]);
      return;
    }

    setBusy(true);
    // Try NLU mode first; if edge isn't deployed we'll surface a clear error.
    const n = await callNlu(say);
    if (n.ok && n.json) {
      const reply = n.json.reply ?? "OK.";
      setMessages(m => [...m, { role:"assistant", ts: Date.now(), text: reply }]);
    } else {
      const err = n.error ? `${n.error}${n.raw ? `: ${n.raw}` : ""}` : `status ${n.status}`;
      setMessages(m => [...m, { role:"assistant", ts: Date.now(), text: `Error talking to edge: ${err}` }]);
    }
    setBusy(false);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button className="px-2 py-1 rounded border" onClick={() => window.location.reload()}>Refresh</button>
        <button className="px-2 py-1 rounded border" onClick={doPing}>Ping Edge</button>
      </div>

      {diag && (
        <pre className="text-xs p-2 bg-muted rounded overflow-x-auto">{diag}</pre>
      )}

      <div className="space-y-2">
        {messages.map((m,i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block px-3 py-2 rounded ${m.role==="user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm opacity-70">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=> e.key==="Enter" ? send() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-3 py-2 border rounded" onClick={send}>Send</button>
      </div>
    </div>
  );
}