import { useState } from "react";
import { callEdge } from "@/lib/ai";

export default function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role:'user'|'assistant'; text:string; ts:number}[]>([
    { role: 'assistant', text: "Hi! Tell me anything and I'll echo it from the edge function.", ts: Date.now() }
  ]);

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");

    // 1) show user message immediately
    setMessages(m => [...m, { role: 'user', text: say, ts: Date.now() }]);

    // 2) call edge
    try {
      const data = await callEdge(say);
      const reply = data?.reply ?? "No reply.";
      setMessages(m => [...m, { role: 'assistant', text: reply, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${err.message || err}`, ts: Date.now() }]);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Chat with AI</h2>
        <button 
          onClick={() => window.location.reload()} 
          className="px-3 py-1 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-2 min-h-[400px] max-h-[400px] overflow-y-auto border rounded p-3">
        {messages.map((m, i) => (
          <div key={i} className={`rounded-lg p-2 max-w-xs ${m.role === 'user' ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-muted'}`}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' ? send() : null}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button 
          onClick={send}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Send
        </button>
      </div>
    </div>
  );
}