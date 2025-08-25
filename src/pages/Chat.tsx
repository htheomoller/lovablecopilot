import { useEffect, useMemo, useRef, useState } from 'react';
import { Env, EdgeOk, Extracted } from '@/lib/copilot/types';

type Msg = { role:'user'|'assistant'|'system'; text:string; ts:number; id?:string };

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`;

function isEdgeOk(x:any): x is EdgeOk { return x && x.success === true; }

const emptyExtracted: Extracted = {
  tone: null, idea: null, name: null, audience: null,
  features: [], privacy: null, auth: null, deep_work_hours: null,
};

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [answers, setAnswers] = useState(emptyExtracted);
  const [pending, setPending] = useState(false);
  const lastEnvRef = useRef<Env|null>(null);
  const reqCounter = useRef(0);

  // helpers
  const pushAssistant = (text:string, id?:string) =>
    setMessages(m => [...m, { role:'assistant', text, ts:Date.now(), id }]);

  const dedupe = (env:Env) => {
    const prev = lastEnvRef.current;
    if (!prev) return false;
    return (
      prev.reply_to_user === env.reply_to_user &&
      (prev.status?.next_question ?? null) === (env.status?.next_question ?? null)
    );
  };

  const sendToEdge = async (userText:string) => {
    setPending(true);
    const rid = `req_${++reqCounter.current}`;
    setMessages(m => [...m, { role:'user', text:userText, ts:Date.now(), id:rid }]);
    try {
      const res = await fetch(ENDPOINT, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ mode:'chat', prompt:userText, snapshot:answers }),
      });
      const data = await res.json();
      if (!isEdgeOk(data)) {
        pushAssistant(`Error: ${data.error || 'unknown error'}`);
        setPending(false);
        return;
      }

      // Build Env from top-level (no envelope)
      const env: Env = {
        reply_to_user: data.reply_to_user ?? '',
        extracted: data.extracted ?? answers,
        status: data.status ?? { complete:false, missing:[], next_question:null },
        suggestions: data.suggestions ?? [],
      };

      // De-duplicate repeated assistant turn
      if (!dedupe(env)) {
        pushAssistant(env.reply_to_user);
      }

      // Reflect memory (and stop asking for known fields)
      setAnswers(env.extracted);
      lastEnvRef.current = env;
      setPending(false);
    } catch (e:any) {
      pushAssistant(`Network error: ${e?.message ?? e}`);
      setPending(false);
    }
  };

  // initial prompt
  useEffect(() => {
    setMessages([
      { role:'assistant',
        text:"Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.",
        ts: Date.now()
      }
    ]);
  }, []);

  const onChip = (label:string) => {
    if (pending) return;
    void sendToEdge(label);
  };

  // suggestion chips from last env
  const chips = useMemo(() => lastEnvRef.current?.suggestions ?? [], [messages]);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      <div className="text-xs text-muted-foreground">Endpoint: {ENDPOINT}</div>

      <div className="space-y-2">
        {messages.map((m,i) => (
          <div key={i} className={m.role==='user' ? 'text-right' : ''}>
            <div className={`inline-block rounded-xl px-3 py-2 ${m.role==='user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {m.text}
            </div>
            {/* Render chips only under the last assistant message */}
            {i === messages.length-1 && m.role === 'assistant' && chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {chips.map((s,idx) => (
                  <button
                    key={idx}
                    disabled={pending}
                    onClick={() => onChip(s)}
                    className="rounded-full border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex gap-2 pt-2"
        onSubmit={(e) => { 
          e.preventDefault(); 
          const f=e.currentTarget; 
          const input = (f.elements.namedItem('msg') as HTMLInputElement); 
          const v=input.value.trim(); 
          if(!v||pending) return; 
          input.value=''; 
          void sendToEdge(v); 
        }}>
        <input 
          name="msg" 
          placeholder="Type your message…" 
          className="flex-1 rounded-md border border-border bg-background px-3 py-2" 
          disabled={pending}
        />
        <button 
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" 
          disabled={pending}
        >
          Send
        </button>
      </form>

      <details className="mt-2 text-xs text-muted-foreground">
        <summary>Answers (debug)</summary>
        <pre className="whitespace-pre-wrap">{JSON.stringify(answers, null, 2)}</pre>
      </details>
    </div>
  );
}