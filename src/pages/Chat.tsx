import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/ai';

interface ChatMsg { role: 'user'|'assistant'; text: string; ts: number }

const LS_KEY_MSGS = 'cp_chat_msgs_v1';
const LS_KEY_ANS  = 'cp_chat_answers_v1';

export default function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  // Load once
  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(LS_KEY_MSGS) || 'null');
      const a = JSON.parse(localStorage.getItem(LS_KEY_ANS)  || 'null');
      if (Array.isArray(m) && m.length) setMessages(m);
      else setMessages([{ role:'assistant', text:"Hi — let's get your idea moving! I'll ask a few quick questions, keep notes for you, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime.\n\nHow should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer.", ts: Date.now() }]);
      if (a && typeof a === 'object') setAnswers(a);
    } catch {}
  }, []);

  // Persist after each change
  useEffect(() => {
    try { localStorage.setItem(LS_KEY_MSGS, JSON.stringify(messages)); } catch {}
  }, [messages]);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY_ANS, JSON.stringify(answers)); } catch {}
  }, [answers]);

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');
    setMessages(m => [...m, { role:'user', text: say, ts: Date.now() }]);

    // style quick-pick
    if (/^(eli5|intermediate|developer)$/i.test(say)) {
      const picked = say.toLowerCase();
      setMessages(m => [...m, { role:'assistant', text: `Got it — I'll keep it ${picked === 'eli5' ? 'super simple (ELI5)' : picked}. What's your app idea in one short line?`, ts: Date.now() }]);
      return;
    }

    // If we still need required fields → call NLU
    const required = ['idea','name','audience','features','privacy','auth','deep_work_hours'];
    const missing = required.find(k => {
      const v = (answers as any)[k];
      return v == null || (Array.isArray(v) && v.length === 0);
    });

    setBusy(true);
    try {
      const data = await callEdge(say, 'nlu');
      if (data?.reply) {
        setMessages(m => [...m, { role:'assistant', text: data.reply, ts: Date.now() }]);
      }
      if (data?.field) {
        setAnswers(prev => ({ ...prev, [data.field]: data.value }));
        // Ask next question, or close the loop
        const a2 = { ...answers, [data.field]: data.value } as any;
        const nextKey = required.find(k => {
          const v = a2[k];
          return v == null || (Array.isArray(v) && v.length === 0);
        });
        if (nextKey) {
          const qMap: Record<string,string> = {
            idea: "What's your app idea in one short line?",
            name: "Do you have a name? If not, say 'invent one' or type a short name (e.g. PhotoFix).",
            audience: "Who is it for (your ideal user/customer)?",
            features: "List top 2–3 must‑have features (comma separated).",
            privacy: "Data visibility: Private, Share via link, or Public?",
            auth: "Sign‑in: Google OAuth, Magic email link, or None (dev only)?",
            deep_work_hours: "Daily focused work hours: 0.5, 1, 2, or 4+?"
          };
          setMessages(m => [...m, { role:'assistant', text: qMap[nextKey], ts: Date.now() }]);
        } else {
          setMessages(m => [...m, { role:'assistant', text: "Nice — I have what I need. Want me to draft a roadmap now? (say: generate roadmap)", ts: Date.now() }]);
        }
      }
    } catch (err: any) {
      setMessages(m => [...m, { role:'assistant', text: `Error: ${err?.message || 'edge call failed'}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    try { localStorage.removeItem(LS_KEY_MSGS); localStorage.removeItem(LS_KEY_ANS); } catch {}
    setAnswers({});
    setMessages([{ role:'assistant', text:"Hi — let's get your idea moving! I'll ask a few quick questions, keep notes for you, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime.\n\nHow should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer.", ts: Date.now() }]);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded border" onClick={() => window.location.reload()}>Refresh</button>
          <button className="px-3 py-1 rounded border" onClick={resetAll}>Reset</button>
        </div>
      </div>

      <div className="space-y-2">
        {messages.map((m,i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block px-3 py-2 rounded ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=> e.key === 'Enter' ? send() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-3 py-2 rounded bg-primary text-primary-foreground" onClick={send}>Send</button>
      </div>
    </div>
  );
}