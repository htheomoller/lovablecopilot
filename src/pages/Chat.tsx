import React, { useEffect, useState } from 'react';

// Types
type Role = 'user' | 'assistant';
interface ChatMsg { role: Role; text: string; ts: number }
interface Answers { idea?: string; name?: string; audience?: string; features?: string[]; privacy?: string; auth?: string; deep_work_hours?: string }

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
  const [messages, setMessages] = useState<ChatMsg[]>(() => load<ChatMsg[]>('cp_chat_messages_v1', []));
  const [answers, setAnswers]   = useState<Answers>(() => load<Answers>('cp_chat_answers_v1', {}));
  const [style, setStyle]       = useState<'eli5'|'intermediate'|'developer'>(() => load<'eli5'|'intermediate'|'developer'>('cp_chat_style_v1','eli5'));
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);

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
  useEffect(() => { save('cp_chat_style_v1', style); }, [style]);

  const push = (m: ChatMsg) => setMessages(prev => [...prev, m]);

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');
    push({ role: 'user', text: say, ts: Date.now() });

    // Quick style selection
    if (/^(eli5|intermediate|developer)$/i.test(say)) {
      const picked = say.toLowerCase() as 'eli5'|'intermediate'|'developer';
      setStyle(picked);
      const q = nextQuestion(answers) || "When you're ready, say 'yes' and I'll draft a roadmap.";
      push({ role: 'assistant', text: `Great — I'll explain like ${picked}. ${q}`, ts: Date.now() });
      return;
    }

    // If onboarding incomplete → NLU capture, reflect, then ask next
    const need = nextQuestion(answers);
    if (need) {
      setBusy(true);
      try {
        const nlu = await callEdge({ mode: 'nlu', prompt: say });
        if (nlu?.field) {
          const next: Answers = { ...answers };
          (next as any)[nlu.field] = nlu.value;
          setAnswers(next);
          push({ role: 'assistant', text: nlu.reply, ts: Date.now() });
          const q2 = nextQuestion(next);
          if (q2) push({ role: 'assistant', text: q2, ts: Date.now() });
          else push({ role: 'assistant', text: "Awesome — I have everything I need. Would you like me to **draft and review a roadmap now**? (yes/no)", ts: Date.now() });
        } else {
          push({ role: 'assistant', text: nlu?.reply || 'Thanks — could you say that in one short line?', ts: Date.now() });
        }
      } catch (e: any) {
        push({ role: 'assistant', text: `Error calling onboarding service: ${e?.message || 'please try again'}`, ts: Date.now() });
      } finally { setBusy(false); }
      return;
    }

    // After all fields captured: handle yes/no for roadmap
    if (/^(yes|yeah|yep|please|ok)$/i.test(say)) {
      setBusy(true);
      try {
        const r = await callEdge({ mode: 'roadmap', answer_style: style, answers });
        push({ role: 'assistant', text: r?.reply || 'Roadmap ready.', ts: Date.now() });
      } catch (e: any) {
        push({ role: 'assistant', text: `Error generating roadmap: ${e?.message || 'please try again'}`, ts: Date.now() });
      } finally { setBusy(false); }
      return;
    }
    if (/^(no|not yet|later)$/i.test(say)) {
      push({ role: 'assistant', text: "No problem — we can refine your answers more or start whenever you like.", ts: Date.now() });
      return;
    }

    // Light small-talk fallback (kept minimal for now)
    push({ role: 'assistant', text: "Got it — if you want me to draft the roadmap now, just say 'yes'.", ts: Date.now() });
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Chat with AI</h1>
        <button className="px-3 py-1 rounded bg-secondary text-secondary-foreground" onClick={() => window.location.reload()}>Refresh</button>
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