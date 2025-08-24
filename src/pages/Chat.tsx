import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/ai';

interface Msg { role: 'user'|'assistant'; text: string; ts: number }
interface Answers { 
  style?: 'eli5'|'intermediate'|'developer';
  idea?: string; 
  name?: string; 
  audience?: string; 
  features?: string[]; 
  privacy?: string; 
  auth?: string; 
  deep_work_hours?: string; 
}

interface Session {
  messages: Msg[];
  answers: Record<string, string>;
  phase: 'onboarding' | 'summary_review' | 'roadmap_review' | 'complete';
}

const ORDER: (keyof Answers)[] = ['style','idea','name','audience','features','privacy','auth','deep_work_hours'];

function nextQuestion(a: Answers): string {
  if (!a.style) return 'First, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer.';
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
  const [session, setSession] = useState<Session>({ messages: [], answers: {}, phase: 'onboarding' });
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
      const greeting = "Hi — let's get started building your idea! I'll ask you some questions so I can understand what you want to make. Once I have enough, I'll draft a roadmap for you. You can interrupt anytime with questions.\n\nFirst, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer.";
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
      if (session.phase === 'onboarding') {
        // Send to OpenAI NLU during onboarding
        const data = await callEdge(say, 'nlu');
        let reply = data?.reply ?? 'No reply.';
        
        if (data?.field && data?.shortValue) {
          const next: Answers = { ...answers };
          const nextSession = { ...session };
          
          if (data.field === 'features' && Array.isArray(data.value)) {
            next.features = data.value;
            nextSession.answers[data.field] = data.shortValue;
          } else {
            (next as any)[data.field] = data.value;
            nextSession.answers[data.field] = data.shortValue;
          }
          
          persistAnswers(next);
          setSession(nextSession);
          
          const q = nextQuestion(next);
          if (q) {
            reply += `\n\n${q}`;
          } else {
            // All fields collected, move to summary phase
            nextSession.phase = 'summary_review';
            setSession(nextSession);
            
            // Generate summary
            setTimeout(async () => {
              try {
                const summaryData = await callEdge('', 'summary', nextSession.answers);
                const summaryReply = `Here's what I've got so far:\n\n${summaryData.summary}\n\nDo you want to make any changes, or should we move on to creating your roadmap?`;
                persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }, { role: 'assistant' as const, text: summaryReply, ts: Date.now() }]);
                setBusy(false);
              } catch (err: any) {
                persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }, { role: 'assistant' as const, text: `Error generating summary: ${err.message}`, ts: Date.now() }]);
                setBusy(false);
              }
            }, 100);
            return;
          }
        }
        
        persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
      } else if (session.phase === 'summary_review') {
        // Handle summary approval
        if (/(^|\b)(yes|yeah|sure|ok|okay|move on|roadmap|continue)(\b|$)/i.test(say)) {
          const nextSession = { ...session, phase: 'roadmap_review' as const };
          setSession(nextSession);
          
          // Generate roadmap
          const roadmapData = await callEdge('', 'roadmap', session.answers);
          const roadmapReply = `Here's a draft roadmap for your project:\n\n${roadmapData.roadmap}\n\nWant me to adjust anything, or should we lock it in?`;
          persistMessages([...newMessages, { role: 'assistant' as const, text: roadmapReply, ts: Date.now() }]);
        } else {
          // Handle changes request
          const reply = 'What would you like to change? I can update any part of your project details.';
          persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
        }
      } else if (session.phase === 'roadmap_review') {
        // Handle roadmap approval
        if (/(^|\b)(yes|yeah|sure|ok|okay|lock it in|approve|good)(\b|$)/i.test(say)) {
          const nextSession = { ...session, phase: 'complete' as const };
          setSession(nextSession);
          
          const reply = 'Perfect! Your roadmap is locked in. I\'ve created your project milestones and you\'re all set to start building!';
          persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
        } else {
          // Handle roadmap changes
          const reply = 'What adjustments would you like me to make to the roadmap?';
          persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
        }
      } else {
        // General chat after completion
        const data = await callEdge(say, 'chat');
        const reply = data?.reply ?? 'How can I help you further?';
        persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
      }
    } catch (err: any) {
      persistMessages([...newMessages, { role: 'assistant' as const, text: `Error: ${err.message || err}`, ts: Date.now() }]);
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
          setSession({ messages: [], answers: {}, phase: 'onboarding' });
          setAnswers({});
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