import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/edge';

interface Msg { role: 'user'|'assistant'; text: string; ts: number }
interface Answers { idea?: string; name?: string; audience?: string; features?: string[]; privacy?: string; auth?: string; deep_work_hours?: string; answer_style?: 'eli5'|'intermediate'|'developer' }

const ORDER: (keyof Answers)[] = ['answer_style','idea','name','audience','features','privacy','auth','deep_work_hours'];
function nextQuestion(a: Answers): string {
  if (!a.answer_style) return 'How should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer.';
  if (!a.idea) return 'What\'s your app idea in one short line?';
  if (!a.name) return 'Do you have a name? If not, say "invent one" or type a short name (e.g. PhotoFix).';
  if (!a.audience) return 'Who is it for (your ideal customer/user)?';
  if (!a.features || a.features.length === 0) return 'List top 2–3 must‑have features (comma separated).';
  if (!a.privacy) return 'Data visibility: Private, Share via link, or Public?';
  if (!a.auth) return 'Sign‑in: Google OAuth, Magic email link, or None (dev only)?';
  if (!a.deep_work_hours) return 'Daily focused work hours: 0.5, 1, 2, or 4+?';
  return '';
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Try restore simple state
    try {
      const a = localStorage.getItem('cp_ans_v1');
      if (a) setAnswers(JSON.parse(a));
    } catch {}
    setMessages([{ role: 'assistant', text: "Hi — let's get your idea moving! I'll ask a few quick questions, keep notes, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime. " + nextQuestion({}), ts: Date.now() }]);
  }, []);

  function persist(next: Answers) {
    setAnswers(next);
    try { localStorage.setItem('cp_ans_v1', JSON.stringify(next)); } catch {}
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: say, ts: Date.now() }]);

    setBusy(true);
    try {
      // Pipe through tiny NLU so we always capture one normalized field
      const data = await callEdge(say, 'nlu');
      if (data?.reply) {
        setMessages(m => [...m, { role: 'assistant', text: data.reply, ts: Date.now() }]);
      }
      if (data?.field) {
        const next: Answers = { ...answers };
        if (data.field === 'features' && Array.isArray(data.value)) next.features = data.value;
        else (next as any)[data.field] = data.value;
        persist(next);
        const q = nextQuestion(next);
        if (q) setMessages(m => [...m, { role: 'assistant', text: q, ts: Date.now() }]);
        else setMessages(m => [...m, { role: 'assistant', text: "Great — I have enough to draft a roadmap. Type 'generate roadmap' when you want me to create milestones.", ts: Date.now() }]);
      }
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', text: `Error talking to edge: ${err.message || String(err)}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">Chat with Copilot</h1>
        <button className="px-2 py-1 border rounded" onClick={() => window.location.reload()}>Refresh</button>
        <button className="px-2 py-1 border rounded" onClick={() => { localStorage.removeItem('cp_ans_v1'); setAnswers({}); setMessages([{ role:'assistant', text: nextQuestion({}), ts: Date.now() }]); }}>Reset</button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>{m.text}</div>
        ))}
        {busy && <div className="opacity-70">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' ? send() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-3 py-2 border rounded" onClick={send}>Send</button>
      </div>
    </div>
  );
}