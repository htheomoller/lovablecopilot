import React, { useMemo, useState } from 'react';
import { QUESTIONS } from '@/lib/onboarding';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function ChatOnboarding() {
  const { user } = useAuth();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const q = useMemo(() => QUESTIONS[i], [i]);
  const [input, setInput] = useState('');
  const [select, setSelect] = useState(q?.options?.[0]?.value || '');
  const done = i >= QUESTIONS.length;

  async function saveAnswer(id: string, value: any) {
    if (!user) return alert('Please sign in');
    await supabase.from('project_guidelines').insert({ user_id: user.id, k: id, v: { value } });
  }

  async function next() {
    if (!q) return;
    const value = q.type === 'select' ? select : input.trim();
    if (!value) return;
    await saveAnswer(q.id, value);
    setAnswers(a => ({ ...a, [q.id]: value }));
    setInput('');
    setI(i + 1);
  }

  async function finish() {
    if (!user) return alert('Please sign in');
    // Create 2-3 starting milestones based on answers
    const timestamp = Date.now();
    const ms = [
      { 
        id: `onboard-setup-${timestamp}`,
        project: 'CoPilot',
        name: 'Setup & Auth', 
        status: 'in_progress', 
        duration_days: 5, 
        owner_id: user.id,
        start_date: new Date().toISOString().split('T')[0]
      },
      { 
        id: `onboard-chat-${timestamp}`,
        project: 'CoPilot',
        name: 'Chat Onboarding', 
        status: 'pending', 
        duration_days: 7, 
        owner_id: user.id,
        start_date: new Date().toISOString().split('T')[0]
      },
      { 
        id: `onboard-roadmap-${timestamp}`,
        project: 'CoPilot',
        name: 'Roadmap & Health', 
        status: 'pending', 
        duration_days: 3, 
        owner_id: user.id,
        start_date: new Date().toISOString().split('T')[0]
      }
    ];
    await supabase.from('ledger_milestones').insert(ms);
    await supabase.from('dev_breadcrumbs').insert({
      owner_id: user.id,
      scope: 'onboarding',
      summary: 'Onboarding finished',
      details: { answers },
      tags: ['onboarding']
    });
    alert('Onboarding saved. Check Roadmap.');
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">Chat Onboarding</h1>
          <p>Please sign in to continue with onboarding.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Chat Onboarding</h1>
      {!done ? (
        <div className="space-y-3">
          <div className="text-sm opacity-70">Step {i+1} of {QUESTIONS.length}</div>
          <div className="text-lg font-medium">{q.label}</div>
          {q.type === 'select' ? (
            <select value={select} onChange={e=>setSelect(e.target.value)} className="border rounded p-2 w-full">
              {q.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input value={input} onChange={e=>setInput(e.target.value)} placeholder={q.placeholder}
                   className="border rounded p-2 w-full" />
          )}
          <div className="flex gap-2">
            <button onClick={next} className="px-3 py-2 border rounded">Next</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-lg">That's it. We'll create your first milestones now.</div>
          <button onClick={finish} className="px-3 py-2 border rounded">Finish & Create Milestones</button>
        </div>
      )}
    </div>
  );
}