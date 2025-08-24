import React, { useEffect, useRef, useState } from "react";
import { chatEdge, pingEdge, EDGE_ENDPOINT } from "@/lib/ai";

type Msg = { role: "assistant" | "user" | "system"; text: string; ts: number };

const LS_KEY = "cp_chat_messages_v1";

function loadMessages(): Msg[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: Msg[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(msgs));
  } catch {}
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>(() => {
    const prior = loadMessages();
    if (prior.length) return prior;
    return [
      {
        role: "assistant",
        ts: Date.now(),
        text:
          "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. " +
          "How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.",
      },
    ];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  async function onPing() {
    try {
      const r = await pingEdge();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          ts: Date.now(),
          text: `Endpoint: ${EDGE_ENDPOINT}\nPing → ${JSON.stringify(r)}`,
        },
      ]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", ts: Date.now(), text: `Ping error: ${String(err?.message || err)}` },
      ]);
    }
  }

  function onRefresh() {
    // Keep it a true refresh; some frameworks swallow a plain button without type
    window.location.reload();
  }

  function onReset() {
    // Do NOT reload. Clear state and storage so the UI is predictable.
    localStorage.removeItem(LS_KEY);
    setMessages([
      {
        role: "assistant",
        ts: Date.now(),
        text:
          "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. " +
          "How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.",
      },
    ]);
    setInput("");
    inputRef.current?.focus();
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", ts: Date.now(), text: say }]);

    try {
      setBusy(true);
      // IMPORTANT: only "chat" mode. No NLU calls.
      const r = await chatEdge(say);
      const reply =
        (r as any)?.reply ??
        (typeof r === "object" ? JSON.stringify(r) : "No reply from edge.");
      setMessages((m) => [...m, { role: "assistant", ts: Date.now(), text: String(reply) }]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          ts: Date.now(),
          text: `Error talking to edge: ${String(err?.message || err)}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat with Copilot</h1>
        <button onClick={onRefresh} className="px-2 py-1 border rounded">
          Refresh
        </button>
        <button onClick={onReset} className="px-2 py-1 border rounded">
          Reset
        </button>
        <button onClick={onPing} className="px-2 py-1 border rounded">
          Ping Edge
        </button>
      </div>

      <div className="space-y-2 border rounded p-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "bg-blue-50 border border-blue-200 rounded px-3 py-2 inline-block"
                : "bg-gray-100 border border-gray-200 rounded px-3 py-2 inline-block"
            }
          >
            {m.text}
          </div>
        ))}
        {busy && <div className="text-sm text-gray-500">…thinking</div>}
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={send} className="px-3 py-2 border rounded">
          Send
        </button>
      </div>
      <p className="text-xs text-gray-500">Endpoint: {EDGE_ENDPOINT}</p>
    </div>
  );
}
