import React, { useEffect, useMemo, useRef, useState } from 'react';
import { nlu, makeRoadmap, type Answers } from '@/lib/ai';

interface Msg { role: 'assistant' | 'user'; text: string; ts: number }
const KEY = 'cp_chat_v2';

const ORDER: (keyof Answers)[] = ['answer_style','idea','name','audience','features','privacy','auth','deep_work_hours'];

function missingKey(a: Answers): keyof Answers | '' {
  for (const k of ORDER) {
    const v = a[k];
    if (v == null || (Array.isArray(v) && v.length === 0) || v === '') return k;
  }
  return '';
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const atBottomRef = useRef<HTMLDivElement | null>(null);

  // Load saved state
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && saved.answers) {
        setAnswers(saved.answers);
        setMessages(saved.messages || []);
      } else {
        // greet
        setMessages([{ role: 'assistant', ts: Date.now(), text:
          "Hi — let's get started building your idea! I'll ask a few quick questions so I can understand what you want to make. Once I have enough, I'll draft a roadmap. You can interrupt anytime with questions. First, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer." }]);
      }
    } catch {
      setMessages([{ role: 'assistant', ts: Date.now(), text:
        "Hi — let's get started building your idea! I'll ask a few quick questions so I can understand what you want to make. Once I have enough, I'll draft a roadmap. You can interrupt anytime with questions. First, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer." }]);
    }
  }, []);

  // Persist state
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ messages, answers })); } catch {}
    // autoscroll
    atBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, answers]);

  const allDone = useMemo(() => missingKey(answers) === '', [answers]);

  async function send() {
    const say = input.trim();
    if (!say || busy) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: say, ts: Date.now() }]);

    try {
      setBusy(true);
      // Always ask NLU to interpret and format a friendly reply
      const res = await nlu(say, answers, (answers.answer_style || 'intermediate'));
      const reply: string = res?.reply || "";
      const kv = res?.kv as { key?: string, value?: any } | undefined;
      const next = res?.next_prompt as string | undefined;

      // Update answers if a real key was returned
      if (kv && kv.key && kv.key !== 'none' && (ORDER as string[]).includes(kv.key)) {
        setAnswers(prev => ({ ...prev, [kv.key as keyof Answers]: kv.value as any }));
      }

      if (reply) {
        setMessages(m => [...m, { role: 'assistant', text: reply, ts: Date.now() }]);
      }

      // If we are still missing something, gently ask the next thing
      const missing = missingKey({ ...answers, ...(kv && kv.key && kv.key !== 'none' ? { [kv.key]: kv.value } : {}) });
      if (missing) {
        const fallback = missing === 'answer_style' ?
          "How should I talk to you? Say: ELI5, Intermediate, or Developer." :
          missing === 'idea' ? "What's your app idea in one short line?" :
          missing === 'name' ? "Do you have a name? If not, would you like a short working name suggestion?" :
          missing === 'audience' ? "Who is it for (your ideal user/customer)?" :
          missing === 'features' ? "List your top 2–3 must‑have features (comma‑separated)." :
          missing === 'privacy' ? "Data visibility: Private, Share via link, or Public?" :
          missing === 'auth' ? "Sign‑in: Google OAuth, Magic email link, or None (dev only)?" :
          "Daily focused work hours: 0.5, 1, 2, or 4+?";
        setMessages(m => [...m, { role: 'assistant', text: next || fallback, ts: Date.now() }]);
        return;
      }

      // If complete, show a crisp summary and ask for approval to generate roadmap
      if (!allDone) {
        const a = { ...answers, ...(kv && kv.key && kv.key !== 'none' ? { [kv.key]: kv.value } : {}) } as Answers;
        const summary = [
          `Style: ${a.answer_style || 'intermediate'}`,
          `Idea: ${a.idea || '—'}`,
          `Name: ${a.name || '—'}`,
          `Audience: ${a.audience || '—'}`,
          `Features: ${Array.isArray(a.features) ? a.features.join(', ') : (a.features || '—')}`,
          `Privacy: ${a.privacy || '—'}`,
          `Auth: ${a.auth || '—'}`,
          `Deep Work Hours: ${a.deep_work_hours || '—'}`
        ].join('\n');
        setMessages(m => [
          ...m,
          { role: 'assistant', ts: Date.now(), text: `Great — here's what I captured:\n\n${summary}\n\nShall I draft a roadmap now? (yes/no)` }
        ]);
      }
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', text: `Error talking to AI: ${err?.message || err}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  async function handleYes() {
    try {
      setBusy(true);
      const r = await makeRoadmap(answers, answers.answer_style || 'intermediate');
      const reply: string = r?.reply || 'Roadmap ready.';
      setMessages(m => [...m, { role: 'assistant', text: reply, ts: Date.now() }]);
      // (Milestone insertion into DB can be handled later on server or a separate call.)
    } catch (err: any) {
      setMessages(m => [...m, { role: 'assistant', text: `Error generating roadmap: ${err?.message || err}`, ts: Date.now() }]);
    } finally { setBusy(false); }
  }

  // Small input helpers: let users type 'yes' to trigger roadmap when ready
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'user') {
      const say = last.text.trim().toLowerCase();
      if (say === 'yes' && missingKey(answers) === '') {
        handleYes();
      }
    }
  }, [messages]);

  function resetAll() {
    setAnswers({});
    setMessages([{ role: 'assistant', ts: Date.now(), text:
      "Hi — let's get started building your idea! I'll ask a few quick questions so I can understand what you want to make. Once I have enough, I'll draft a roadmap. You can interrupt anytime with questions. First, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer." }]);
    try { localStorage.removeItem(KEY); } catch {}
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button onClick={() => window.location.reload()} className="px-2 py-1 border rounded">Refresh</button>
        <button onClick={resetAll} className="px-2 py-1 border rounded">Reset</button>
        {busy && <span className="text-sm opacity-70">…thinking</span>}
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'assistant' ? 'bg-muted/40 p-2 rounded' : 'text-right'}>
            <div className="whitespace-pre-wrap">{m.text}</div>
          </div>
        ))}
        <div ref={atBottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 border rounded"
          placeholder={busy ? 'Please wait…' : 'Type your message…'}
          disabled={busy}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
        />
        <button onClick={send} disabled={busy} className="px-3 py-2 border rounded">Send</button>
      </div>
    </div>
  );
}