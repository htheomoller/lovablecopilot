import React, { useEffect, useState } from 'react';

// Types
type Role = 'user' | 'assistant';
interface ChatMsg { role: Role; text: string; ts: number }
interface Answers { idea?: string; name?: string; audience?: string; features?: string[]; privacy?: string; auth?: string; deep_work_hours?: string; answerStyle?: string }

const ORDER: (keyof Answers)[] = ['idea','name','audience','features','privacy','auth','deep_work_hours'];

function nextQuestion(a: Answers): string | '' {
  for (const k of ORDER) {
    const v = (a as any)[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) {
      switch (k) {
        case 'idea': return "First, what's your app idea in one short line?";
        case 'name': return "Do you have a name yet? If not, say 'invent one' or type a short name (e.g. PhotoFix).";
        case 'audience': return "Who is this for? (your ideal user/customer)";
        case 'features': return "List your top 2–3 must‑have features (comma separated).";
        case 'privacy': return "Data visibility: Private, Share via link, or Public?";
        case 'auth': return "Sign‑in preference: Google OAuth, Magic email link, or None (dev only)?";
        case 'deep_work_hours': return "How many focused hours can you work per day: 0.5, 1, 2, or 4+?";
      }
    }
  }
  return '';
}

function load<T>(k: string, fallback: T): T { try { const j = localStorage.getItem(k); return j ? JSON.parse(j) as T : fallback; } catch { return fallback; } }
function save<T>(k: string, v: T) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

async function callEdge(payload: any) {
  const res = await fetch('https://yjfqfnmrsdfbvlyursdi.supabase.co/functions/v1/ai-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('Non-JSON response from edge');
  return await res.json();
}

export default function Chat() {
  // --- persistent storage keys (keep in one place) ---
  const STORAGE = {
    answers: 'cp_chat_answers_v1',
    session: 'cp_chat_session_v1'
  } as const;

  const [messages, setMessages] = useState<ChatMsg[]>(() => load<ChatMsg[]>('cp_chat_messages_v1', []));
  const [answers, setAnswers] = useState<Answers>(() => load<Answers>('cp_chat_answers_v1', {}));
  const [answerStyle, setAnswerStyle] = useState<'eli5'|'intermediate'|'developer'>('eli5');
  const [answersStyleChosen, setAnswersStyleChosen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Warm, lively greeting on first load
  useEffect(() => {
    if (messages.length === 0) {
      const intro = "Hi — let's get your idea moving! I'll ask a few quick questions, keep notes for you, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime.\n\nHow should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer.";
      const m: ChatMsg = { role: 'assistant', text: intro, ts: Date.now() };
      setMessages([m]);
      save('cp_chat_messages_v1', [m]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { save('cp_chat_messages_v1', messages); }, [messages]);
  useEffect(() => { save('cp_chat_answers_v1', answers); }, [answers]);
  useEffect(() => { save('cp_chat_style_v1', answerStyle); }, [answerStyle]);
  useEffect(() => { save('cp_style_chosen_v1', answersStyleChosen); }, [answersStyleChosen]);

  // --- Reset helper: clears local state + localStorage, then re-seeds greeting ---
  function resetChat() {
    try {
      localStorage.removeItem(STORAGE.answers);
      localStorage.removeItem(STORAGE.session);
    } catch {}
    setAnswers({});
    setAnswerStyle('eli5');
    setAnswersStyleChosen(false);
    setMessages([{ role: 'assistant', text: "Hi — let's get your idea moving! I'll ask a few quick questions, keep notes for you, and when I have enough, I'll propose a roadmap. You can jump in with questions anytime.\n\nHow should I talk to you today? Say: ELI5 (very simple), Intermediate, or Developer.", ts: Date.now() }]);
  }

  const push = (m: ChatMsg) => setMessages(prev => [...prev, m]);

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');

    // show user message immediately
    setMessages(m => [...m, { role: 'user', text: say, ts: Date.now() }]);

    // --- STEP 1: Style selection guard ---
    if (!answersStyleChosen) {
      // persist minimal session marker so refresh keeps style next time (optional)
      const lower = say.toLowerCase();
      const choose = (style: 'eli5'|'intermediate'|'developer', confirmText: string) => {
        setAnswerStyle(style);
        setAnswersStyleChosen(true);
        try { localStorage.setItem(STORAGE.session, JSON.stringify({ style, ts: Date.now() })); } catch {}
        setMessages(m => [...m, { role: 'assistant', text: confirmText, ts: Date.now() }]);
      };

      if (lower.includes('eli5') || lower.includes('simple')) {
        choose('eli5', "Got it — I'll keep it super simple (ELI5). Now, what's your app idea in one short line?");
        return;
      }
      if (lower.includes('intermediate')) {
        choose('intermediate', "Great — I'll explain at an intermediate level. What's your app idea?");
        return;
      }
      if (lower.includes('developer') || lower.includes('technical')) {
        choose('developer', "Okay — I'll use developer-level detail. What's your app idea?");
        return;
      }
      // If style not picked yet → re-ask
      setMessages(m => [...m, { role: 'assistant', text: 'Please choose one: ELI5 (simple), Intermediate, or Developer.', ts: Date.now() }]);
      return;
    }

    // --- STEP 2: Normal NLU once style is chosen ---
    try {
      setBusy(true);
      const data = await callEdge({ mode: 'nlu', prompt: say });
      // persist answers snapshot whenever we capture a field
      if (data?.field) {
        try {
          const next = { ...(answers as any), [data.field]: data.value };
          localStorage.setItem(STORAGE.answers, JSON.stringify(next));
        } catch {}
      }
      if (data?.reply) setMessages(m => [...m, { role: 'assistant', text: data.reply, ts: Date.now() }]);
      if (data?.field) {
        setAnswers(prev => ({ ...prev, [data.field]: data.value }));
        const nq = nextQuestion({ ...answers, [data.field]: data.value });
        if (nq) {
          setMessages(m => [...m, { role: 'assistant', text: nq, ts: Date.now() }]);
        } else {
          setMessages(m => [...m, { role: 'assistant', text: 'Great — I\'ve got everything I need. Would you like me to draft your roadmap now?', ts: Date.now() }]);
        }
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${err?.message || 'edge call failed'}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Chat with AI</h1>
        <button className="px-3 py-1 rounded bg-secondary text-secondary-foreground" onClick={() => window.location.reload()}>Refresh</button>
        <button
          type="button"
          onClick={resetChat}
          className="px-3 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/80 ml-2"
        >
          Reset
        </button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'assistant' ? 'bg-muted p-3 rounded' : 'text-right'}>
            <div className={m.role === 'assistant' ? 'whitespace-pre-wrap' : 'inline-block bg-primary text-primary-foreground px-3 py-2 rounded whitespace-pre-wrap'}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 border rounded"
          placeholder="Type here… (or say ELI5 / Intermediate / Developer)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' ? send() : undefined}
        />
        <button className="px-4 py-2 rounded bg-primary text-primary-foreground" onClick={send}>Send</button>
      </div>
    </div>
  );
}