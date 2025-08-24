import React, { useEffect, useState } from 'react';
import { callEdge, pingEdge, currentAiEndpoint } from '@/lib/ai';

type Msg = { role: 'user' | 'assistant' | 'system'; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState(currentAiEndpoint());
  const [lastPing, setLastPing] = useState('');

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      text: `Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: ELI5 (very simple), Intermediate, or Developer.`,
      ts: Date.now()
    }]);
  }, []);

  async function doPing() {
    setLastPing('…pinging');
    try {
      const r = await pingEdge(); // expects { success:true, mode:'ping', reply:'pong' }
      setLastPing(`ai-generate → ok:true status:200 reply:${JSON.stringify(r)}`);
    } catch (e: any) {
      setLastPing(`Ping error: ${e.message || String(e)}`);
    }
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');
    setMessages(m => [...m, { role:'user', text: say, ts: Date.now() }]);

    // quick style capture locally; no NLU required to avoid misfires
    if (/^(eli5|intermediate|developer)$/i.test(say)) {
      const mode = say.toUpperCase();
      setMessages(m => [...m, { role:'assistant', text:`Got it — I'll keep it ${mode === 'ELI5' ? 'very simple' : mode === 'INTERMEDIATE' ? 'at an intermediate level' : 'developer-focused'}. What's your app idea in one short line?`, ts: Date.now() }]);
      return;
    }

    try {
      setBusy(true);
      // Basic chat pass-through; the edge function can be expanded later
      const data = await callEdge({ mode: 'chat', prompt: say });
      const reply = data?.reply ?? data?.generatedText ?? '👍';
      setMessages(m => [...m, { role:'assistant', text: reply, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role:'assistant', text: `Error talking to edge: ${err?.message || String(err)}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button onClick={() => window.location.reload()} className="px-3 py-1 rounded border">Refresh</button>
        <button onClick={doPing} className="px-3 py-1 rounded border">Ping Edge</button>
      </div>

      <div className="text-xs text-muted-foreground">
        Endpoint: <code>{endpoint}</code>
      </div>
      {lastPing && <div className="text-xs"><code>{lastPing}</code></div>}

      <div className="space-y-2 border rounded p-3 bg-white">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block px-3 py-2 rounded ${m.role==='user' ? 'bg-blue-50' : 'bg-gray-50'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-muted-foreground">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' ? send() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={send} className="px-4 py-2 rounded bg-blue-600 text-white">Send</button>
      </div>
    </div>
  );
}