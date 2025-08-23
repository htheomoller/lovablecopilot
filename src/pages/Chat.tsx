import React, { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { loadSession, saveSession, nextQuestion, type ChatSession } from '@/lib/chatWizard'

interface MessageType {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

export default function Chat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [style, setStyle] = useState<'eli5'|'intermediate'|'developer'>('eli5');
  const [session, setSession] = useState(loadSession());

  useEffect(() => {
    // boot greeting if empty
    if (session.messages.length === 0) {
      const greet = { role:'assistant', text:"I'll chat naturally and keep notes for your project. First, how technical should I be? (ELI5 • Intermediate • Developer)", ts:Date.now() } as any;
      setMessages([greet]);
    } else {
      setMessages(session.messages as any);
    }
  }, []);

  useEffect(()=>{ saveSession({ ...session, messages: messages as any, answerStyle: style }); }, [messages, style]);

  const handleSend = async () => {
    const say = input.trim();
    if (!say) return;
    const userMsg = { role:'user', text: say, ts: Date.now() } as any;
    setMessages(prev => [...prev, userMsg]);

    // If choosing style quickly
    if (/^eli5$|^intermediate$|^developer$/i.test(say)) {
      const picked = say.toLowerCase() as any;
      setStyle(picked);
      const bot = { role:'assistant', text:`Great — I'll explain like ${picked}. ${nextQuestion(session) || "Say \"generate roadmap\" when you're ready."}`, ts: Date.now() } as any;
      setMessages(prev => [...prev, bot]);
      setInput('');
      return;
    }

    // If we still need a field → call NLU to normalize this answer
    const q = nextQuestion(session);
    const needField = q ? true : false;

    if (needField) {
      const nlu = await fetch('/functions/v1/ai-generate', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ mode:'nlu', answer_style: style, prompt: say })
      });
      const j = await nlu.json();
      // expected: { field, value, confidence, reply }
      if (j.field && j.value) {
        const updated = { ...session, answers: { ...session.answers, [j.field]: j.value } };
        setSession(updated);
        const reflect = { role:'assistant', text:`Got it: **${j.field}** → "${j.value}". ${nextQuestion(updated) || "If everything looks right, say: generate roadmap."}`, ts: Date.now() } as any;
        setMessages(prev => [...prev, reflect]);
      } else {
        const fallback = { role:'assistant', text: j.reply || "Thanks — could you rephrase that in one short line?", ts: Date.now() } as any;
        setMessages(prev => [...prev, fallback]);
      }
      setInput('');
      return;
    }

    // Roadmap trigger
    if (/^generate roadmap$/i.test(say)) {
      const r = await fetch('/functions/v1/ai-generate', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ mode:'roadmap', answer_style: style, answers: session.answers })
      });
      const data = await r.json();
      const bot = { role:'assistant', text: (data.reply || "Roadmap ready."), ts: Date.now() } as any;
      setMessages(prev => [...prev, bot]);
      // (optional) seed milestones client-side if returned
      if (Array.isArray(data.milestones) && data.milestones.length) {
        // You already have a server-side seeding flow; here we just notify.
        const note = { role:'assistant', text:"I've generated milestones — check the Roadmap tab.", ts: Date.now() } as any;
        setMessages(prev => [...prev, note]);
      }
      setInput('');
      return;
    }

    // Otherwise, light, helpful small-talk via chat mode
    const res = await fetch('/functions/v1/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: say, mode:'chat', answer_style: style }),
    });

    const data = await res.json();
    setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.generatedText } as any]);
    setInput('');
  }

  return (
    <div className="max-w-2xl mx-auto p-4 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              msg.role === 'user' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-card border'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your response..."
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!input.trim()}>
          Send
        </Button>
      </div>
    </div>
  )
}
