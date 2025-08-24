import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/edge';

// Minimal conversational flow using local state + deterministic NLU

type Msg = { role: 'user'|'assistant'; text: string; ts: number };

type Answers = Partial<{
  idea: string;
  name: string;
  audience: string;
  features: string[];
  privacy: 'Private'|'Share via link'|'Public';
  auth: 'Google OAuth'|'Magic email link'|'None (dev only)';
  deep_work_hours: '0.5'|'1'|'2'|'4+';
}>;

const ORDER: (keyof Answers)[] = ['idea','name','audience','features','privacy','auth','deep_work_hours'];

function nextQuestion(a: Answers): string | '' {
  for (const k of ORDER) {
    if (a[k] == null || (Array.isArray(a[k]) && (a[k] as any[]).length === 0)) {
      switch (k) {
        case 'idea': return "Tell me your app idea in one short line (what it does).";
        case 'name': return "Do you have a name? If not, type a short name (e.g. PhotoFix).";
        case 'audience': return "Who is it for? (ideal user/customer)";
        case 'features': return "List top 2–3 must‑have features (comma separated).";
        case 'privacy': return "Data visibility: Private, Share via link, or Public?";
        case 'auth': return "Sign‑in: Google OAuth, Magic email link, or None (dev only)?";
        case 'deep_work_hours': return "Daily focused work hours: 0.5, 1, 2, or 4+?";
      }
    }
  }
  return '';
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);

  // Greet on first load
  useEffect(() => {
    setMessages([{ role: 'assistant', text: "Hi! I'll chat naturally and keep notes. " + nextQuestion({}), ts: Date.now() }]);
  }, []);

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');

    // show user msg immediately
    setMessages(m => [...m, { role: 'user', text: say, ts: Date.now() }]);

    try {
      setBusy(true);
      const data = await callEdge(say, 'nlu');
      if (data?.reply) {
        setMessages(m => [...m, { role: 'assistant', text: data.reply ?? (data?.raw || 'No reply.'), ts: Date.now() }]);
      }
      if (data?.field) {
        setAnswers(prev => {
          const next = { ...prev } as Answers;
          (next as any)[data.field] = data.value;
          // after capturing, ask the next needed question
          const nq = nextQuestion(next);
          if (nq) {
            setMessages(m => [...m, { role: 'assistant', text: nq, ts: Date.now() }]);
          } else {
            setMessages(m => [...m, { role: 'assistant', text: "Great — I've got everything I need. Type 'generate roadmap' when you want me to draft milestones (we'll wire that next).", ts: Date.now() }]);
          }
          // persist minimal snapshot so a reload keeps progress
          try { localStorage.setItem('cp_chat_answers_v1', JSON.stringify(next)); } catch {}
          return next;
        });
      }
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
        <button className="px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => window.location.reload()}>Refresh</button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={m.role === 'user' ? 'inline-block bg-blue-600 text-white px-3 py-2 rounded-lg' : 'inline-block bg-muted px-3 py-2 rounded-lg'}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' ? send() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={send}>Send</button>
      </div>
    </div>
  );
}
