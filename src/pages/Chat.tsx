import React, { useEffect, useState } from 'react';
import { callEdge } from '@/lib/ai';
import { supabase } from '@/integrations/supabase/client';

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
  answers: Answers;
  phase: 'onboarding' | 'summary_review' | 'roadmap_review' | 'complete';
  currentField?: string;
  waitingConfirmation?: boolean;
  pendingValue?: any;
}

const FIELD_ORDER: (keyof Answers)[] = ['style','idea','name','audience','features','privacy','auth','deep_work_hours'];

const FIELD_QUESTIONS = {
  style: "How should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer.",
  idea: "What's your app idea in one short line?",
  name: "Do you already have a name for your app?",
  audience: "Who is it for? Who's your ideal user?",
  features: "What are the top 2–3 must-have features?",
  privacy: "Data visibility: Private, Share via link, or Public?",
  auth: "Sign-in method: Google OAuth, Magic email link, or None (dev only)?",
  deep_work_hours: "Daily focused work hours: 0.5, 1, 2, or 4+?"
};

function nextQuestion(answers: Answers): string {
  for (const field of FIELD_ORDER) {
    if (!answers[field]) {
      return FIELD_QUESTIONS[field];
    }
  }
  return '';
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [session, setSession] = useState<Session>({ 
    messages: [], 
    answers: {}, 
    phase: 'onboarding' 
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Restore session from localStorage
    let hasMessages = false;
    try {
      const savedSession = localStorage.getItem('cp_session_v3');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        setSession(parsed);
        setMessages(parsed.messages);
        hasMessages = parsed.messages.length > 0;
      }
    } catch {}
    
    // If no saved messages, start with greeting
    if (!hasMessages) {
      const greeting = "Hi — let's get started building your idea! I'll ask you a few quick questions so I can understand what you want to make. Once I have enough, I'll draft a roadmap. Anytime you're unsure, just interrupt me.\n\nHow should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer.";
      const initialMessages: Msg[] = [{ role: 'assistant' as const, text: greeting, ts: Date.now() }];
      const newSession = { ...session, messages: initialMessages, currentField: 'style' };
      setMessages(initialMessages);
      setSession(newSession);
      persistSession(newSession);
    }
  }, []);

  function persistSession(newSession: Session) {
    setSession(newSession);
    try { localStorage.setItem('cp_session_v3', JSON.stringify(newSession)); } catch {}
  }

  function persistMessages(newMessages: Msg[], sessionUpdate: Partial<Session> = {}) {
    const updatedSession = { ...session, ...sessionUpdate, messages: newMessages };
    setMessages(newMessages);
    persistSession(updatedSession);
  }

  async function send() {
    const say = input.trim();
    if (!say || busy) return;
    setInput('');
    
    const newMessages: Msg[] = [...messages, { role: 'user' as const, text: say, ts: Date.now() }];
    setMessages(newMessages);

    setBusy(true);
    try {
      if (session.phase === 'onboarding') {
        await handleOnboardingInput(say, newMessages);
      } else if (session.phase === 'summary_review') {
        await handleSummaryReview(say, newMessages);
      } else if (session.phase === 'roadmap_review') {
        await handleRoadmapReview(say, newMessages);
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

  async function handleOnboardingInput(say: string, newMessages: Msg[]) {
    const { currentField, waitingConfirmation, pendingValue } = session;
    
    // Handle confirmation responses
    if (waitingConfirmation) {
      const isConfirmed = /(^|\b)(yes|yeah|sure|ok|okay|correct|right|good|looks good)(\b|$)/i.test(say);
      const isRejected = /(^|\b)(no|nope|change|edit|wrong|different)(\b|$)/i.test(say);
      
      if (isConfirmed && currentField && pendingValue) {
        // Confirm and save the value
        const newAnswers = { ...session.answers, [currentField]: pendingValue };
        const confirmReply = currentField === 'name' && pendingValue.includes('suggest') 
          ? "Perfect! I'll note that down."
          : "Perfect! I'll note that down.";
        
        const updatedMessages = [...newMessages, { role: 'assistant' as const, text: confirmReply, ts: Date.now() }];
        
        // Ask next question or move to summary
        const nextQ = nextQuestion(newAnswers);
        if (nextQ) {
          const nextField = FIELD_ORDER.find(f => !newAnswers[f]);
          updatedMessages.push({ role: 'assistant' as const, text: nextQ, ts: Date.now() });
          persistMessages(updatedMessages, { 
            answers: newAnswers, 
            currentField: nextField,
            waitingConfirmation: false, 
            pendingValue: undefined 
          });
        } else {
          // All fields collected, move to summary
          setTimeout(async () => {
            try {
              const summaryData = await callEdge('', 'summary', newAnswers);
              const summaryMessages = [...updatedMessages, { role: 'assistant' as const, text: summaryData.summary + '\n\n' + summaryData.reply, ts: Date.now() }];
              persistMessages(summaryMessages, { 
                answers: newAnswers, 
                phase: 'summary_review',
                waitingConfirmation: false, 
                pendingValue: undefined 
              });
            } catch (err: any) {
              persistMessages([...updatedMessages, { role: 'assistant' as const, text: `Error generating summary: ${err.message}`, ts: Date.now() }]);
            }
            setBusy(false);
          }, 100);
          return;
        }
      } else if (isRejected) {
        // Reject and ask again
        const rejectReply = `No problem! ${FIELD_QUESTIONS[currentField as keyof typeof FIELD_QUESTIONS]}`;
        persistMessages([...newMessages, { role: 'assistant' as const, text: rejectReply, ts: Date.now() }], {
          waitingConfirmation: false,
          pendingValue: undefined
        });
      } else {
        // Unclear response, ask for clarification
        persistMessages([...newMessages, { role: 'assistant' as const, text: "Sorry, I didn't catch that. Does the information look correct, or would you like to change something?", ts: Date.now() }]);
      }
      return;
    }

    // Handle name field specially
    if (currentField === 'name' && !session.answers.name) {
      const hasName = /(^|\b)(yes|yeah|sure|i have|it's called|called|named)(\b|$)/i.test(say);
      const noName = /(^|\b)(no|nope|don't have|haven't|need one|suggest|invent)(\b|$)/i.test(say);
      
      if (hasName) {
        // Ask for the name
        persistMessages([...newMessages, { role: 'assistant' as const, text: "Great! What's the name?", ts: Date.now() }], {
          currentField: 'name_input'
        });
        return;
      } else if (noName) {
        // Offer to suggest
        persistMessages([...newMessages, { role: 'assistant' as const, text: "That's okay — we need at least a working name. Do you want me to suggest one, or would you like to invent one yourself?", ts: Date.now() }], {
          currentField: 'name_choice'
        });
        return;
      }
    }

    if (currentField === 'name_input') {
      // Capture the name directly
      const newAnswers = { ...session.answers, name: say };
      const reply = `Love it — I'll note that your app is called "${say}".`;
      const updatedMessages = [...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }];
      
      const nextQ = nextQuestion(newAnswers);
      if (nextQ) {
        const nextField = FIELD_ORDER.find(f => !newAnswers[f]);
        updatedMessages.push({ role: 'assistant' as const, text: nextQ, ts: Date.now() });
        persistMessages(updatedMessages, { 
          answers: newAnswers, 
          currentField: nextField 
        });
      }
      return;
    }

    if (currentField === 'name_choice') {
      const wantsSuggestion = /(^|\b)(suggest|recommend|you pick|your choice|come up with)(\b|$)/i.test(say);
      
      if (wantsSuggestion && session.answers.idea) {
        // Generate name suggestion
        const data = await callEdge('', 'nlu', {}, 'name_suggest', session.answers.idea);
        const newAnswers = { ...session.answers, name: data.value };
        const reply = data.reply;
        const updatedMessages = [...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }];
        
        const nextQ = nextQuestion(newAnswers);
        if (nextQ) {
          const nextField = FIELD_ORDER.find(f => !newAnswers[f]);
          updatedMessages.push({ role: 'assistant' as const, text: nextQ, ts: Date.now() });
          persistMessages(updatedMessages, { 
            answers: newAnswers, 
            currentField: nextField 
          });
        }
        return;
      } else {
        // They want to invent one themselves
        persistMessages([...newMessages, { role: 'assistant' as const, text: "Perfect! What name would you like to use?", ts: Date.now() }], {
          currentField: 'name_input'
        });
        return;
      }
    }

    // Handle regular field input with OpenAI
    if (currentField) {
      const data = await callEdge(say, 'nlu', {}, currentField, session.answers.idea || '');
      
      if (data?.field && data?.value) {
        if (['audience', 'features'].includes(currentField)) {
          // For audience and features, ask for confirmation
          persistMessages([...newMessages, { role: 'assistant' as const, text: data.reply, ts: Date.now() }], {
            waitingConfirmation: true,
            pendingValue: currentField === 'features' ? data.value : data.shortValue
          });
        } else {
          // For other fields, save directly and continue
          const newAnswers = { ...session.answers, [data.field]: data.value };
          const reply = data.reply;
          const updatedMessages = [...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }];
          
          const nextQ = nextQuestion(newAnswers);
          if (nextQ) {
            const nextField = FIELD_ORDER.find(f => !newAnswers[f]);
            updatedMessages.push({ role: 'assistant' as const, text: nextQ, ts: Date.now() });
            persistMessages(updatedMessages, { 
              answers: newAnswers, 
              currentField: nextField 
            });
          } else {
            // All fields collected, move to summary
            setTimeout(async () => {
              try {
                const summaryData = await callEdge('', 'summary', newAnswers);
                const summaryMessages = [...updatedMessages, { role: 'assistant' as const, text: summaryData.summary + '\n\n' + summaryData.reply, ts: Date.now() }];
                persistMessages(summaryMessages, { 
                  answers: newAnswers, 
                  phase: 'summary_review' 
                });
              } catch (err: any) {
                persistMessages([...updatedMessages, { role: 'assistant' as const, text: `Error generating summary: ${err.message}`, ts: Date.now() }]);
              }
              setBusy(false);
            }, 100);
            return;
          }
        }
      } else {
        persistMessages([...newMessages, { role: 'assistant' as const, text: "I didn't quite catch that. Could you try rephrasing?", ts: Date.now() }]);
      }
    }
  }

  async function handleSummaryReview(say: string, newMessages: Msg[]) {
    const isApproved = /(^|\b)(yes|yeah|sure|ok|okay|looks good|correct|right|roadmap|draft)(\b|$)/i.test(say);
    
    if (isApproved) {
      // Generate roadmap
      const roadmapData = await callEdge('', 'roadmap', session.answers);
      const roadmapReply = `Here's a draft roadmap for your project:\n\n${roadmapData.roadmap}\n\n${roadmapData.reply}`;
      persistMessages([...newMessages, { role: 'assistant' as const, text: roadmapReply, ts: Date.now() }], {
        phase: 'roadmap_review'
      });
    } else {
      // Handle edit request
      const reply = 'What would you like to change? Just tell me which part needs updating.';
      persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
    }
  }

  async function handleRoadmapReview(say: string, newMessages: Msg[]) {
    const isApproved = /(^|\b)(yes|yeah|sure|ok|okay|lock it in|approve|good|looks good)(\b|$)/i.test(say);
    
    if (isApproved) {
      // Seed milestones and complete
      try {
        const { data: user } = await supabase.auth.getUser();
        if (user?.user?.id) {
          const { error } = await supabase.rpc('create_sample_milestones', { 
            user_id: user.user.id 
          });
          
          if (!error) {
            const reply = 'Perfect! Your roadmap is locked in. I\'ve created your project milestones and you\'re all set to start building!';
            persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }], {
              phase: 'complete'
            });
          } else {
            throw new Error('Failed to create milestones');
          }
        }
      } catch (err: any) {
        const reply = `Great! Your roadmap is approved. ${err.message ? 'Note: ' + err.message : 'You\'re all set to start building!'}`;
        persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }], {
          phase: 'complete'
        });
      }
    } else {
      // Handle roadmap changes
      const reply = 'What adjustments would you like me to make to the roadmap?';
      persistMessages([...newMessages, { role: 'assistant' as const, text: reply, ts: Date.now() }]);
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

  function resetSession() {
    localStorage.removeItem('cp_session_v3');
    const newSession: Session = { messages: [], answers: {}, phase: 'onboarding' };
    setSession(newSession);
    setMessages([]);
    window.location.reload();
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button className="px-2 py-1 text-sm rounded bg-secondary" onClick={resetSession}>Reset</button>
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