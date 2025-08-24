import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/ai';

interface Msg { role: 'user'|'assistant'; text: string; ts: number }
interface Answers { 
  idea?: string; 
  name?: string; 
  audience?: string; 
  features?: string[]; 
  privacy?: string; 
  auth?: string; 
  deep_work_hours?: string; 
  answer_style?: 'eli5'|'intermediate'|'developer' 
}

const ORDER: (keyof Answers)[] = ['idea','name','audience','features','privacy','auth','deep_work_hours'];

function nextQuestion(a: Answers): string {
  if (!a.idea) return 'What\'s your app idea in one short line?';
  if (!a.name) return 'Do you have a name? If not, say "invent one" or type a short name (e.g. PhotoFix).';
  if (!a.audience) return 'Who is it for (your ideal customer/user)?';  
  if (!a.features || a.features.length === 0) return 'List top 2–3 must‑have features (comma separated).';
  if (!a.privacy) return 'Data visibility: Private, Share via link, or Public?';
  if (!a.auth) return 'Sign‑in: Google OAuth, Magic email link, or None (dev only)?';
  if (!a.deep_work_hours) return 'Daily focused work hours: 0.5, 1, 2, or 4+?';
  return '';
}

function detectAnswerStyle(input: string): 'eli5'|'intermediate'|'developer'|null {
  const lower = input.toLowerCase();
  if (/(^|\b)(eli5|very simple|simple|scared of code|not technical|beginner)(\b|$)/.test(lower)) return 'eli5';
  if (/(^|\b)(intermediate|some experience|medium)(\b|$)/.test(lower)) return 'intermediate';
  if (/(^|\b)(developer|dev|technical|advanced|code)(\b|$)/.test(lower)) return 'developer';
  return null;
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Restore messages and answers from localStorage
    let hasMessages = false;
    try {
      const savedMessages = localStorage.getItem('cp_messages_v1');
      const savedAnswers = localStorage.getItem('cp_ans_v1');
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (parsed.length > 0) {
          setMessages(parsed);
          hasMessages = true;
        }
      }
      if (savedAnswers) {
        setAnswers(JSON.parse(savedAnswers));
      }
    } catch {}
    
    // If no saved messages, start with greeting
    if (!hasMessages) {
      const greeting = "Hi — let's get started building your idea! I'll ask you a few quick questions so I can understand what you want to make. Once I have enough, I'll build a roadmap for you. Anytime you're unsure, just ask me.\n\nTo start, how should I talk to you? Say: ELI5 (very simple), Intermediate, or Developer.";
      const initialMessages: Msg[] = [{ role: 'assistant' as const, text: greeting, ts: Date.now() }];
      setMessages(initialMessages);
      try { localStorage.setItem('cp_messages_v1', JSON.stringify(initialMessages)); } catch {}
    }
  }, []);

  function persistMessages(newMessages: Msg[]) {
    setMessages(newMessages);
    try { localStorage.setItem('cp_messages_v1', JSON.stringify(newMessages)); } catch {}
  }

  function persistAnswers(newAnswers: Answers) {
    setAnswers(newAnswers);
    try { localStorage.setItem('cp_ans_v1', JSON.stringify(newAnswers)); } catch {}
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput('');
    
    const newMessages: Msg[] = [...messages, { role: 'user' as const, text: say, ts: Date.now() }];
    persistMessages(newMessages);

    setBusy(true);
    try {
      // Check if we're still in answer style selection phase
      if (!answers.answer_style) {
        const style = detectAnswerStyle(say);
        if (style) {
          const next = { ...answers, answer_style: style };
          persistAnswers(next);
          const styleText = style === 'eli5' ? 'very simple' : style;
          const reply = `Got it — I'll keep it ${styleText}. ${nextQuestion(next)}`;
          persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
          setBusy(false);
          return;
        }
      }

      // Handle roadmap trigger  
      if (nextQuestion(answers) === '' && /(^|\b)(yes|yeah|sure|ok|okay|review|roadmap)(\b|$)/i.test(say)) {
        const reply = 'Great! Let me build your roadmap now...';
        persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
        setBusy(false);
        return;
      }

      // Send to OpenAI NLU
      const data = await callEdge(say, 'nlu');
      let reply = data?.reply ?? 'No reply.';
      
      if (data?.field) {
        const next: Answers = { ...answers };
        if (data.field === 'features' && Array.isArray(data.value)) {
          next.features = data.value;
        } else {
          (next as any)[data.field] = data.value;
        }
        persistAnswers(next);
        
        const q = nextQuestion(next);
        if (q) {
          reply += `\n\n${q}`;
        } else {
          reply += `\n\nGreat — I have everything I need. Would you like to review your roadmap now?`;
        }
      }
      
      persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
    } catch (err: any) {
      persistMessages([...newMessages, { role: 'assistant' as const, text: `Error talking to edge: ${err.message || err}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  async function ping() {
    try {
      const data = await callEdge('ping', 'chat');
      const newMessages: Msg[] = [...messages, { role: 'assistant' as const, text: `Ping → ${JSON.stringify(data)}`, ts: Date.now() }];
      persistMessages(newMessages);
    } catch (err: any) {
      const newMessages: Msg[] = [...messages, { role: 'assistant' as const, text: `Ping failed: ${err.message || err}`, ts: Date.now() }];
      persistMessages(newMessages);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button className="px-2 py-1 text-sm rounded bg-secondary" onClick={() => {
          localStorage.removeItem('cp_messages_v1');
          localStorage.removeItem('cp_ans_v1');
          window.location.reload();
        }}>Reset</button>
        <button className="px-2 py-1 text-sm rounded bg-secondary" onClick={ping}>Ping Edge</button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role==='user' ? 'text-right' : 'text-left'}>
            <div className="inline-block px-3 py-2 rounded bg-muted">{m.text}</div>
          </div>
        ))}
        {busy && <div className="opacity-60">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=> e.key==='Enter' ? send() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-4 py-2 rounded bg-primary text-primary-foreground" onClick={send}>Send</button>
      </div>
    </div>
  );
}