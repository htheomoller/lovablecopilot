import React from 'react';
import { callEdgeChat, callEdgePing } from '../lib/ai';
import type { ChatMessage, Envelope } from '../lib/types';
import { EMPTY_EXTRACTED, mergeExtracted } from '../lib/types';

const EDGE =
  (import.meta as any).env?.VITE_SUPABASE_URL
    ? `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/ai-generate`
    : '/functions/v1/ai-generate';

function ChipRow({
  items,
  onChoose
}: {
  items: string[];
  onChoose: (s: string) => void;
}) {
  if (!items?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {items.map((s) => (
        <button
          key={s}
          onClick={() => onChoose(s)}
          style={{
            borderRadius: 16,
            padding: '6px 12px',
            border: '1px solid #d0d7de',
            background: '#f6f8fa',
            cursor: 'pointer'
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      role: 'assistant',
      text:
        "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.",
      ts: Date.now()
    }
  ]);
  const [answers, setAnswers] = React.useState(EMPTY_EXTRACTED);
  const [lastEnv, setLastEnv] = React.useState<Envelope | null>(null);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, lastEnv]);

  async function onPing() {
    const data = await callEdgePing(EDGE);
    setMessages((m) => [
      ...m,
      { role: 'assistant', text: `Endpoint: ${EDGE} Ping → ${JSON.stringify(data)}`, ts: Date.now() }
    ]);
  }

  function addUserTurn(text: string) {
    setMessages((m) => [...m, { role: 'user', text, ts: Date.now() }]);
  }

  async function sendPrompt(text: string) {
    if (!text.trim() || busy) return;
    addUserTurn(text);
    setInput('');
    setBusy(true);
    try {
      const data = await callEdgeChat(EDGE, text, answers);
      if (!('success' in data) || data.success !== true || data.mode !== 'chat') {
        setMessages((m) => [
          ...m,
          { role: 'assistant', text: `Error talking to AI: ${'error' in data ? data.error : 'unknown'}`, ts: Date.now() }
        ]);
        setBusy(false);
        return;
      }

      // Envelope built from top-level fields
      const env: Envelope = {
        reply_to_user: (data as any).reply_to_user,
        extracted: (data as any).extracted,
        status: (data as any).status,
        suggestions: (data as any).suggestions || []
      };
      setLastEnv(env);

      // show only the conversational turn (no extra client question)
      setMessages((m) => [...m, { role: 'assistant', text: env.reply_to_user, ts: Date.now() }]);

      // merge answers (one-way, never overwrite with nulls)
      setAnswers((prev) => mergeExtracted(prev, env.extracted));
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `Error talking to AI: ${err?.message || String(err)}`, ts: Date.now() }
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleChipPick(s: string) {
    // send the chip as if the user typed it
    void sendPrompt(s);
  }

  // tone starter chips if tone still missing
  const starterToneChips =
    !answers.tone
      ? ["Explain like I'm 5", 'Intermediate', 'Developer']
      : [];

  // render suggestions directly under the last assistant message
  const activeChips = (lastEnv?.suggestions || []).slice(0, 6);

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', height: '100%', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onPing}>Ping Edge</button>
        <div style={{ fontSize: 12, color: '#6e7781', alignSelf: 'center' }}>Endpoint: {EDGE}</div>
      </div>

      <div ref={listRef} style={{ overflowY: 'auto', padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
        {messages.map((m, i) => (
          <div key={m.ts + i} style={{ margin: '8px 0', display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 12px',
                borderRadius: 12,
                background: m.role === 'user' ? '#2563eb' : '#f3f4f6',
                color: m.role === 'user' ? 'white' : 'black',
                whiteSpace: 'pre-wrap'
              }}
            >
              {m.text}
            </div>
          </div>
        ))}

        {/* chips under the latest assistant turn */}
        <ChipRow items={starterToneChips} onChoose={handleChipPick} />
        <ChipRow items={activeChips} onChoose={handleChipPick} />

        {/* tiny Answers pill for live memory */}
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          Answers: {JSON.stringify(answers)}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendPrompt(input);
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message…"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <button disabled={busy} type="submit">
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}