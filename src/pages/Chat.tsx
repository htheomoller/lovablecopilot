import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/edge';

interface Msg { role: 'user' | 'assistant'; text: string; ts: number }

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', text: "Hi! I'll chat naturally and keep notes. Tell me your app idea in one short line (what it does).", ts: Date.now() }]);
    }
  }, []);

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: say, ts: Date.now() }]);
    try {
      setBusy(true);
      const data = await callEdge(say, 'nlu');
      const reply = data?.reply ?? '…';
      setMessages(m => [...m, { role: 'assistant', text: reply, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${err?.message || 'edge call failed'}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chat with AI</h1>
        <button className="px-3 py-1 rounded bg-secondary text-secondary-foreground" onClick={() => window.location.reload()}>Refresh</button>
      </div>
      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={
              'inline-block px-3 py-2 rounded ' + (m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')
            }>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground">…thinking</div>}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 border rounded"
          placeholder="Type your message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' ? send() : undefined}
        />
        <button className="px-4 py-2 rounded bg-primary text-primary-foreground" onClick={send}>Send</button>
      </div>
    </div>
  );
}