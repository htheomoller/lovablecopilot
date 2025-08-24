import React, { useEffect, useState } from 'react';
import { defaultSession, loadSession, saveSession, clearSession, append, nextQuestion, type ChatMsg, type ChatSession, type AnswerStyle } from '@/lib/chatWizard';

async function callEdge(body: any) {
  const r = await fetch('/functions/v1/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('Non-JSON response from edge');
  return await r.json();
}

export default function Chat() {
  const [session, setSession] = useState<ChatSession>(loadSession());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // greet once
  useEffect(() => {
    if (session.messages.length === 0) {
      let s = append(session, { role: 'assistant', ts: Date.now(), text: "Hi — let's get your idea moving! I'll ask a few quick questions, keep notes for you, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime.\n\nHow should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer." });
      setSession(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = (m: ChatMsg) => { const ns = append(session, m); setSession(ns); };

  const setStyleFromText = (say: string): AnswerStyle | null => {
    const s = say.trim().toLowerCase();
    if (/(^|\b)eli\s*5(\b|$)|\beli5\b|very simple|simple|not technical|scared/.test(s)) return 'eli5';
    if (/(^|\b)intermediate(\b|$)|some technical|a bit technical/.test(s)) return 'intermediate';
    if (/(^|\b)developer(\b|$)|tech|very technical|full detail/.test(s)) return 'developer';
    return null;
  };

  async function send() {
    const say = input.trim(); if (!say) return; setInput('');
    push({ role: 'user', text: say, ts: Date.now() });

    // 1) Style detection first (natural phrases allowed)
    const maybe = setStyleFromText(say);
    if (maybe) {
      const ns = { ...session, style: maybe };
      saveSession(ns); setSession(ns);
      push({ role: 'assistant', ts: Date.now(), text: `Got it — I'll keep it ${maybe === 'eli5' ? 'super simple (ELI5)' : maybe}. ${nextQuestion(ns.answers)}` });
      return;
    }

    // 2) If we still need onboarding fields, use LLM‑NLU
    const need = nextQuestion(session.answers);
    if (need) {
      try {
        setBusy(true);
        const resp = await callEdge({ mode: 'nlu', answer_style: session.style, prompt: say });
        if (resp?.field && typeof resp.value !== 'undefined') {
          const answers = { ...session.answers } as any; answers[resp.field] = resp.value;
          const ns: ChatSession = { ...session, answers };
          saveSession(ns); setSession(ns);
          // reflect + next question
          push({ role: 'assistant', ts: Date.now(), text: resp.reply || `Got it: **${resp.field}**.` });
          const nq = nextQuestion(answers);
          push({ role: 'assistant', ts: Date.now(), text: nq || "Nice — I have what I need. Want me to draft a roadmap now? (say: generate roadmap)" });
        } else {
          push({ role: 'assistant', ts: Date.now(), text: resp?.reply || 'Thanks — could you say that in one short line?' });
        }
      } catch (e: any) {
        push({ role: 'assistant', ts: Date.now(), text: `Error talking to NLU: ${e?.message || e}` });
      } finally {
        setBusy(false);
      }
      return;
    }

    // 3) Explicit roadmap trigger
    if (/^generate\s+roadmap$/i.test(say)) {
      try {
        setBusy(true);
        const resp = await callEdge({ mode: 'roadmap', answer_style: session.style, answers: session.answers });
        push({ role: 'assistant', ts: Date.now(), text: resp?.reply || 'Roadmap ready.' });
        if (Array.isArray(resp?.milestones) && resp.milestones.length) {
          push({ role: 'assistant', ts: Date.now(), text: 'I included a milestones JSON block — check the Roadmap tab.' });
        }
      } catch (e: any) {
        push({ role: 'assistant', ts: Date.now(), text: `Error generating roadmap: ${e?.message || e}` });
      } finally {
        setBusy(false);
      }
      return;
    }

    // 4) Otherwise: light small‑talk via chat mode
    try {
      setBusy(true);
      const resp = await callEdge({ mode: 'chat', answer_style: session.style, prompt: say });
      push({ role: 'assistant', ts: Date.now(), text: resp?.reply || '👍' });
    } catch (e: any) {
      push({ role: 'assistant', ts: Date.now(), text: `Error: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    clearSession();
    const fresh = defaultSession();
    setSession(fresh);
    setTimeout(() => {
      setSession(append(fresh, { role: 'assistant', ts: Date.now(), text: "Hi — let's get your idea moving! I'll ask a few quick questions, keep notes for you, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime.\n\nHow should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer." }));
    }, 0);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="px-3 py-1 bg-secondary rounded">Refresh</button>
          <button onClick={resetAll} className="px-3 py-1 bg-destructive text-destructive-foreground rounded">Reset</button>
        </div>
      </div>

      <div className="space-y-2">
        {session.messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block px-3 py-2 rounded ${m.role==='user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="text-sm opacity-70">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=> e.key==='Enter' ? send() : undefined} placeholder="Type here…" className="flex-1 px-3 py-2 border rounded"/>
        <button onClick={send} className="px-4 py-2 bg-primary text-primary-foreground rounded">Send</button>
      </div>
    </div>
  );
}