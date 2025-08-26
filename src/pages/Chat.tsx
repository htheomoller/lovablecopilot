import { useEffect, useMemo, useRef, useState } from "react";
import { callCpChat, getCpChatUrl, pingCpChat } from "../lib/cpClient";

type Envelope = {
  success: boolean;
  mode: "chat";
  session_id: string;
  turn_id: string;
  reply_to_user: string;
  confidence: "high" | "medium" | "low";
  extracted: {
    tone: "eli5" | "intermediate" | "developer" | null;
    idea: string | null;
    name: string | null;
    audience: string | null;
    features: string[];
    privacy: "Private" | "Share via link" | "Public" | null;
    auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
    deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
  };
  status: { complete: boolean; missing: string[]; next_question: string | null };
  suggestions: string[];
  error: { code: string | null; message: string | null; details?: any };
  meta: { conversation_stage: "discovery" | "planning" | "generating" | "refining"; turn_count: number; schema_version: string };
  block: { language: "lovable-prompt" | "ts" | "js" | "json" | null; content: string | null; copy_safe: boolean } | null;
};

type ChatItem =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; envelope?: Envelope };

function formatReply(reply: any): string {
  if (typeof reply === "string") return reply;
  if (typeof reply === "object" && reply !== null) {
    return JSON.stringify(reply, null, 2);
  }
  return String(reply);
}

function CopyPromptButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm hover:bg-black transition"
      onClick={async () => {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label="Copy Prompt"
    >
      {copied ? "Copied!" : "Copy Prompt"}
    </button>
  );
}

function Banner({ kind, children }: { kind: "warn" | "error" | "info"; children: any }) {
  const styles =
    kind === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : kind === "warn"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-blue-50 border-blue-200 text-blue-700";
  return <div className={`mt-2 text-xs border rounded-lg px-3 py-2 ${styles}`}>{children}</div>;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatItem[]>([
    { role: "assistant", content: "Hi! I'm CP. Ask me anything about your Lovable project. If a prompt or code is generated, I'll include a Copy button." }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [diag, setDiag] = useState<{ url: string; status?: string; sample?: any } | null>(null);

  const sessionIdRef = useRef(() => {
    const tpl = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    return tpl.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }) as unknown as React.MutableRefObject<string>;

  const turnCount = useMemo(() => messages.filter(m => m.role === "user").length, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setLastError(null);
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    try {
      const { ok, status, statusText, data } = await callCpChat({
        session_id: sessionIdRef.current,
        turn_count: turnCount + 1,
        user_input: text
      });
      if (!ok) {
        setLastError(`Invoke failed: ${status} ${statusText}`);
        setMessages(prev => [...prev, { role: "assistant", content: "I couldn't reach the chat engine. Check deployment settings and try again." }]);
        setDiag({ url: getCpChatUrl(), status: `${status} ${statusText}`, sample: data });
        return;
      }
      const envelope: Envelope = data;
      const assistantText = formatReply(
        envelope?.reply_to_user ??
        envelope?.error?.message ??
        "I had trouble processing that. Please try again."
      );
      setMessages(prev => [...prev, { role: "assistant", content: assistantText, envelope }]);
    } catch (e: any) {
      const msg = `Network error: ${e?.message ?? "Unknown"}`;
      setLastError(msg);
      setMessages(prev => [...prev, { role: "assistant", content: "Network error. Please try again." }]);
      setDiag({ url: getCpChatUrl(), status: "client exception", sample: msg });
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function pingFunction() {
    const full = getCpChatUrl();
    setDiag({ url: full, status: "GET …" });
    try {
      // First: GET ping (no preflight)
      const r1 = await pingCpChat();
      // Second: POST minimal (exercise CORS)
      const r2 = await callCpChat({ user_input: "ping" });
      setDiag({
        url: full,
        status: `GET ${r1.status} ${r1.statusText} • POST ${r2.status} ${r2.statusText}`,
        sample: { get: r1.data, post: r2.data }
      });
      if (!r1.ok && !r2.ok) setLastError(`Ping failed (GET ${r1.status}, POST ${r2.status})`);
    } catch (e: any) {
      setLastError(`Ping exception: ${e?.message ?? "Unknown"}`);
    }
  }

  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto px-4" style={{maxWidth: 880}}>
      <header className="py-4 border-b border-zinc-200">
        <h1 className="text-xl font-semibold text-zinc-800">CP — Chat</h1>
        <p className="text-sm text-zinc-500 mt-1">Vite client • Supabase Edge Function with robust CORS + GET ping.</p>
        {lastError ? <Banner kind="error">{lastError}</Banner> : null}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={pingFunction} className="text-xs px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-50">
            Ping cp-chat
          </button>
          <span className="text-xs text-zinc-400">Endpoint: {getCpChatUrl()}</span>
        </div>
        {diag ? (
          <div className="mt-2 p-2 rounded bg-zinc-50 text-xs font-mono text-zinc-600">
            <div>URL: {diag.url}</div>
            {diag.status ? <div>Status: {diag.status}</div> : null}
            {typeof diag.sample === "string" ? (
              <pre className="mt-1 whitespace-pre-wrap">{diag.sample}</pre>
            ) : diag.sample ? (
              <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(diag.sample, null, 2)}</pre>
            ) : null}
          </div>
        ) : null}
      </header>

      <main className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`rounded-2xl px-4 py-3 shadow ${m.role === "user" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`} style={{ maxWidth: "85%" }}>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
              {m.role === "assistant" && (m as any).envelope?.block?.content ? (
                <div className="mt-3 flex items-center gap-2">
                  <CopyPromptButton content={(m as any).envelope.block.content as string} />
                  <span className="text-xs text-zinc-400">
                    {(m as any).envelope.block.language === "lovable-prompt" ? "Lovable prompt ready" : "Code block ready"}
                  </span>
                </div>
              ) : null}
              {m.role === "assistant" && (m as any).envelope?.status?.next_question ? (
                <div className="mt-2 text-xs text-zinc-500">
                  <span className="font-medium">Next:</span> {(m as any).envelope.status.next_question}
                </div>
              ) : null}
              {m.role === "assistant" && (m as any).envelope?.confidence === "low" ? (
                <div className="mt-2 text-xs text-amber-600">Confidence is low — consider rephrasing.</div>
              ) : null}
            </div>
          </div>
        ))}
      </main>

      <footer className="border-t border-zinc-200 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={busy ? "Thinking…" : "Type your message…"}
            className="w-full min-h-[56px] max-h-40 p-3 rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-sm"
          />
          <button onClick={sendMessage} disabled={busy || !input.trim()} className="px-4 h-[44px] rounded-xl bg-black text-white text-sm disabled:opacity-50">
            {busy ? "…" : "Send"}
          </button>
        </div>
        <div className="mt-2 text-[10px] text-zinc-400">Press Enter to send • Shift+Enter for a new line</div>
      </footer>
    </div>
  );
}