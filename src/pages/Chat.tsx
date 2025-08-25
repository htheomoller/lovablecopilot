import { useEffect, useMemo, useRef, useState } from 'react'
import { callExtractor, type ExtractorEnvelope } from '@/lib/aiClient'

// If you already centralize env, feel free to replace these with your helpers:
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const EDGE_ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-generate`

type Msg = { role: 'user' | 'assistant' | 'system'; text: string; ts: number }

type Session = {
  messages: Msg[]
  lastEnvelope: ExtractorEnvelope | null
  pendingQuestion: string | null
  toneLocked: boolean
}

const initialToneChips = [
  "Explain like I'm 5",
  'Intermediate',
  'Developer'
]

const starter: Session = {
  messages: [],
  lastEnvelope: null,
  pendingQuestion: null,
  toneLocked: false
}

function saveSession(s: Session) {
  try { localStorage.setItem('cp_chat_v3', JSON.stringify(s)) } catch {}
}
function loadSession(): Session {
  try {
    const j = localStorage.getItem('cp_chat_v3')
    if (!j) return structuredClone(starter)
    return JSON.parse(j) as Session
  } catch { return structuredClone(starter) }
}

export default function Chat() {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [s, setS] = useState(loadSession())
  const inputRef = useRef<HTMLInputElement>(null)

  // Boot greeting once
  useEffect(() => {
    if (s.messages.length === 0) {
      const m: Msg = {
        role: 'assistant',
        ts: Date.now(),
        text:
          "Hi — let's get started building your idea! I'm wired to an edge function. " +
          "You can test it with the Ping Edge button. How should I talk to you? " +
          "Say: Explain like I'm 5 (very simple), Intermediate, or Developer."
      }
      const next: Session = { ...s, messages: [m], pendingQuestion: null }
      setS(next); saveSession(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helpers to append messages safely (no disappearing turns)
  const push = (msg: Msg) => {
    setS(prev => {
      const next = { ...prev, messages: [...prev.messages, msg] }
      saveSession(next)
      return next
    })
  }

  // Guard to prevent duplicate questions: we only trust model.next_question
  const reflectEnvelope = (env: ExtractorEnvelope) => {
    setS(prev => {
      const prevQ = (prev.pendingQuestion || '').trim()
      const modelQ = (env.status?.next_question || '').trim()
      const nextQuestion = modelQ && modelQ !== prevQ ? modelQ : modelQ ? prevQ : null
      const next: Session = {
        ...prev,
        lastEnvelope: env,
        pendingQuestion: nextQuestion
      }
      saveSession(next)
      return next
    })
  }

  const suggestions = useMemo(() => {
    // If we have model suggestions, prefer them. Otherwise, on the first turn show tone chips.
    if (s.lastEnvelope?.suggestions?.length) return s.lastEnvelope.suggestions
    if (!s.toneLocked) return initialToneChips
    return []
  }, [s.lastEnvelope, s.toneLocked])

  const sendToAI = async (userText: string) => {
    setBusy(true)
    try {
      const ctx = s.lastEnvelope ? s.lastEnvelope.extracted : null
      const { ok, data, error, raw } = await callExtractor(EDGE_ENDPOINT, SUPABASE_ANON_KEY, userText, ctx)
      if (!ok || !data) {
        push({ role: 'assistant', ts: Date.now(), text: `Error talking to AI${error ? `: ${error}` : ''}${raw ? `\n${raw}` : ''}` })
        return
      }

      // Lock tone as soon as we see first valid tone
      if (!s.toneLocked && data.extracted?.tone) {
        setS(prev => { const next = { ...prev, toneLocked: true }; saveSession(next); return next })
      }

      // Show the assistant's natural reply only (no local echo/question)
      push({ role: 'assistant', ts: Date.now(), text: data.reply_to_user })

      // Track last envelope & next question to avoid repeats
      reflectEnvelope(data)

    } finally {
      setBusy(false)
    }
  }

  const handleSend = async (text?: string) => {
    const say = (text ?? input).trim()
    if (!say) return
    setInput('')
    push({ role: 'user', ts: Date.now(), text: say })
    await sendToAI(say)
    // Refocus for speed
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleChip = async (chip: string) => {
    // Tone chips → send a small normalized message
    if (initialToneChips.includes(chip)) {
      const normalized =
        chip.toLowerCase().includes('explain') ? 'tone: eli5' :
        chip.toLowerCase().includes('developer') ? 'tone: developer' :
        'tone: intermediate'
      await handleSend(normalized)
      return
    }
    await handleSend(chip)
  }

  const handlePing = async () => {
    try {
      const r = await fetch(EDGE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {})
        },
        body: JSON.stringify({ mode: 'ping' })
      })
      const raw = await r.text()
      push({ role: 'system', ts: Date.now(), text: `Endpoint: ${EDGE_ENDPOINT}\nPing → ok:${r.ok} status:${r.status} reply:${raw}` })
    } catch (e: any) {
      push({ role: 'system', ts: Date.now(), text: `Ping error: ${e?.message || 'unknown'}` })
    }
  }

  const handleReset = () => {
    const cleared: Session = structuredClone(starter)
    saveSession(cleared)
    setS(cleared)
    // Re-greet
    push({
      role: 'assistant',
      ts: Date.now(),
      text:
        "Hi — let's get started building your idea! I'm wired to an edge function. " +
        "You can test it with the Ping Edge button. How should I talk to you? " +
        "Say: Explain like I'm 5 (very simple), Intermediate, or Developer."
    })
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex gap-2 items-center">
        <h1 className="text-lg font-medium">Chat with Copilot</h1>
        <button
          onClick={handlePing}
          className="px-3 py-1 text-sm rounded border hover:bg-muted"
        >
          Ping Edge
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-1 text-sm rounded border hover:bg-muted"
        >
          Reset
        </button>
      </div>

      <div className="text-xs opacity-70">
        Endpoint: {EDGE_ENDPOINT}
      </div>

      <div className="border rounded p-3 h-[55vh] overflow-auto space-y-3 bg-white">
        {s.messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : (m.role === 'assistant' ? 'bg-gray-100' : 'bg-yellow-50')}`}>
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="text-left">
            <div className="inline-block rounded-2xl px-3 py-2 text-sm bg-gray-100">
              …thinking
            </div>
          </div>
        )}

        {/* Quick reply chips */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => handleChip(sug)}
                className="px-2.5 py-1 text-xs rounded-full border hover:bg-gray-50"
                title="Quick reply"
              >
                {sug}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' ? handleSend() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={() => handleSend()} className="px-4 py-2 rounded bg-black text-white">Send</button>
      </div>
    </div>
  )
}