import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/ai';

interface Msg { role: 'user'|'assistant'; text: string; ts: number }

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessages([{ role:'assistant', text: "Hi — let's get your idea moving! I'll ask a few quick questions, keep notes, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime. How should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer.", ts: Date.now() }]);
  }, []);

  async function send(mode: 'chat'|'nlu' = 'nlu') {
    const say = input.trim();
    if (!say) return;
    setInput('');
    setMessages(m => [...m, { role:'user', text: say, ts: Date.now() }]);
    try {
      setBusy(true);
      const data = await callEdge(say, mode);
      const reply = data?.reply ?? 'No reply.';
      setMessages(m => [...m, { role:'assistant', text: reply, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role:'assistant', text: `Error talking to edge: ${err.message || err}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  async function ping() {
    try {
      const data = await callEdge('ping', 'chat');
      setMessages(m => [...m, { role:'assistant', text: `Ping → ${JSON.stringify(data)}`, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role:'assistant', text: `Ping failed: ${err.message || err}`, ts: Date.now() }]);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button className="px-2 py-1 text-sm rounded bg-secondary" onClick={() => window.location.reload()}>Refresh</button>
        <button className="px-2 py-1 text-sm rounded bg-secondary" onClick={ping}>Ping Edge</button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role==='user' ? 'text-right' : 'text-left'}>
            <div className="inline-block px-3 py-2 rounded bg-muted">{m.text}</div>
          </div>
        ))}
        {busy && <div className="opacity-60">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=> e.key==='Enter' ? send('nlu') : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-4 py-2 rounded bg-primary text-primary-foreground" onClick={() => send('nlu')}>Send</button>
      </div>
    </div>
  );
}