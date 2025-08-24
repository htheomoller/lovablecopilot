import React, { useEffect, useState } from 'react';
import { append, defaultSession, loadSession, nextQuestion, saveSession, ChatMsg } from '@/lib/chatWizard';

export default function Chat() {
  const [session, setSession] = useState(loadSession());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // boot greeting once, and NEVER overwrite user turns
  useEffect(() => {
    if (session.messages.length === 0) {
      let s = append(session, { role: 'assistant', text: "I'll chat naturally and keep notes for your project. First, how technical should I be? (ELI5 • Intermediate • Developer)", ts: Date.now() });
      setSession(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = (m: ChatMsg) => { const ns = append(session, m); setSession(ns); };

  const handleSend = async () => {
    const say = input.trim(); if (!say) return;
    push({ role: 'user', text: say, ts: Date.now() }); // persist USER turn immediately
    setInput('');

    // quick style switch
    if (/^(eli5|intermediate|developer)$/i.test(say)) {
      const picked = say.toLowerCase() as any; const ns = { ...session, answerStyle: picked }; saveSession(ns); setSession(ns);
      push({ role: 'assistant', text: `Great — I'll explain like ${picked}. ${nextQuestion(ns) || "Say 'generate roadmap' when you're ready."}`, ts: Date.now() });
      return;
    }

    // if we still need a field → NLU
    const q = nextQuestion(session);
    if (q) {
      setBusy(true);
      try {
        const res = await fetch('/functions/v1/ai-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'nlu', answer_style: session.answerStyle, prompt: say }) });
        const data = await res.json();
        // ALWAYS echo back what we captured so the chat feels alive
        if (data && data.field && data.value) {
          const ns = { ...session, answers: { ...session.answers, [data.field]: data.value } };
          saveSession(ns); setSession(ns);
          push({ role: 'assistant', text: data.reply || `Got it: **${data.field}** → "${data.value}". ${nextQuestion(ns) || "If everything looks right, say: generate roadmap."}`, ts: Date.now() });
        } else {
          push({ role: 'assistant', text: (data && data.reply) || 'Thanks — could you say that in one short line?', ts: Date.now() });
        }
      } catch (e: any) {
        push({ role: 'assistant', text: 'Error calling AI service, please try again.', ts: Date.now() });
      } finally { setBusy(false); }
      return;
    }

    // roadmap trigger
    if (/^generate roadmap$/i.test(say)) {
      setBusy(true);
      try {
        const res = await fetch('/functions/v1/ai-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'roadmap', answer_style: session.answerStyle, answers: session.answers }) });
        const data = await res.json();
        push({ role: 'assistant', text: data.reply || 'Roadmap ready.', ts: Date.now() });
        if (Array.isArray(data.milestones) && data.milestones.length) {
          push({ role: 'assistant', text: "I've generated milestones — check the Roadmap tab.", ts: Date.now() });
        }
      } catch (e: any) {
        push({ role: 'assistant', text: 'Error generating roadmap — please try again.', ts: Date.now() });
      } finally { setBusy(false); }
      return;
    }

    // light small‑talk
    try {
      const res = await fetch('/functions/v1/ai-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'chat', answer_style: session.answerStyle, prompt: say }) });
      const data = await res.json();
      push({ role: 'assistant', text: data.reply || data.generatedText || '👍', ts: Date.now() });
    } catch { push({ role: 'assistant', text: 'Error calling AI service, please try again.', ts: Date.now() }); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {session.messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'self-end bg-blue-600 text-white rounded-xl px-3 py-2' : 'self-start bg-slate-100 rounded-xl px-3 py-2'}>
            {m.text}
          </div>
        ))}
        {busy && <div className="self-start text-sm opacity-60">…thinking</div>}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 border rounded-xl px-3 py-2" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' ? handleSend() : null} placeholder="Type your response…" />
        <button className="px-4 py-2 rounded-xl bg-blue-600 text-white" onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}