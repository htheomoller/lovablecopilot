import { useEffect, useMemo, useRef, useState } from "react";
import { callCpChat, getCpChatUrl, pingCpChat } from "../lib/cpClient";
import { Send } from "lucide-react";

type Envelope = {
  success: boolean; mode: "chat"; session_id: string; turn_id: string;
  reply_to_user: any; confidence: "high"|"medium"|"low";
  extracted: {
    tone: "eli5"|"intermediate"|"developer"|null;
    idea: string|null; name: string|null; audience: string|null;
    features: string[]; privacy: "Private"|"Share via link"|"Public"|null;
    auth: "Google OAuth"|"Magic email link"|"None (dev only)"|null;
    deep_work_hours: "0.5"|"1"|"2"|"4+"|null;
  };
  status: { complete: boolean; missing: string[]; next_question: string|null };
  suggestions: string[];
  error: { code: string|null; message: string|null; details?: any };
  meta: { 
    conversation_stage: "discovery"|"planning"|"generating"|"refining"; 
    turn_count: number; schema_version?: "1.0"; model?: string; temperature?: number; 
    usage?: { 
      prompt_tokens:number; completion_tokens:number; total_tokens:number; 
      cost?: { input_usd:number; output_usd:number; total_usd:number; currency:"USD" } 
    } 
  };
  block: { language: "lovable-prompt"|"ts"|"js"|"json"|null; content: string|null; copy_safe: boolean } | null;
};

type ChatItem = { role:"user"; content:string } | { role:"assistant"; content:string; envelope?:Envelope };

function reduceMemoryFromMessages(messages: ChatItem[]): { extracted: Partial<Envelope["extracted"]> } {
  const acc: Partial<Envelope["extracted"]> = { features: [] };
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const env = (m as any).envelope as Envelope | undefined;
    if (!env?.extracted) continue;
    const e = env.extracted;
    if (e.tone) acc.tone = e.tone;
    if (e.idea != null) acc.idea = e.idea;
    if (e.name != null) acc.name = e.name;
    if (e.audience != null) acc.audience = e.audience;
    if (Array.isArray(e.features)) acc.features = Array.from(new Set([...(acc.features ?? []), ...e.features]));
    if (e.privacy != null) acc.privacy = e.privacy;
    if (e.auth != null) acc.auth = e.auth;
    if (e.deep_work_hours != null) acc.deep_work_hours = e.deep_work_hours;
  }
  return { extracted: acc };
}

function CopyPromptButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button 
      className="px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-colors" 
      onClick={async ()=>{ 
        await navigator.clipboard.writeText(content); 
        setCopied(true); 
        setTimeout(()=>setCopied(false), 1200); 
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Banner({ kind, children }: { kind: "warn" | "error" | "info"; children: any }) {
  const styles = kind==="error" ? "bg-destructive/10 border-destructive/20 text-destructive" : 
                 kind==="warn" ? "bg-yellow-50 border-yellow-200 text-yellow-700" : 
                 "bg-primary/10 border-primary/20 text-primary";
  return <div className={`mt-2 text-xs border rounded-lg px-3 py-2 ${styles}`}>{children}</div>;
}

function formatReply(raw: unknown): string { 
  if (raw==null) return ""; 
  if (typeof raw==="string") return raw; 
  try { 
    const s=JSON.stringify(raw); 
    return s.length<=140?s:JSON.stringify(raw,null,2);
  } catch { 
    return String(raw);
  } 
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatItem[]>([
    { role:"assistant", content:"Hi! I'm CP, your Lovable project assistant. I can help you plan, generate code, and guide you through building your app. What would you like to work on today?" }
  ]);
  const [input, setInput] = useState(""); 
  const [busy, setBusy] = useState(false); 
  const [lastError, setLastError] = useState<string|null>(null);
  const [diag, setDiag] = useState<{ url: string; status?: string; sample?: any } | null>(null);

  const sessionIdRef = useRef(() => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { 
    const r=(Math.random()*16)|0; 
    const v=c==="x"?r:(r&0x3)|0x8; 
    return v.toString(16); 
  })) as unknown as React.MutableRefObject<string>;
  
  const turnCount = useMemo(()=> messages.filter(m=>m.role==="user").length, [messages]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function sendMessage() {
    const text=input.trim(); 
    if (!text || busy) return;
    setBusy(true); 
    setLastError(null);
    setMessages(prev=>[...prev, { role:"user", content:text }]); 
    setInput("");

    try {
      const memory = reduceMemoryFromMessages(messages);
      const { ok, status, statusText, data } = await callCpChat({
        session_id: sessionIdRef.current,
        turn_count: turnCount + 1,
        user_input: text,
        memory
      });
      if (!ok) {
        setLastError(`Invoke failed: ${status} ${statusText}`);
        setMessages(prev=>[...prev, { role:"assistant", content:"I couldn't reach the chat engine. Check deployment settings and try again." }]);
        setDiag({ url: getCpChatUrl(), status: `${status} ${statusText}`, sample: data }); 
        return;
      }
      const envelope: Envelope = data;
      const assistantText = formatReply(envelope?.reply_to_user ?? envelope?.error?.message ?? "I had trouble processing that. Please try again.");
      setMessages(prev=>[...prev, { role:"assistant", content: assistantText, envelope }]);
    } catch (e:any) {
      const msg=`Network error: ${e?.message ?? "Unknown"}`; 
      setLastError(msg);
      setMessages(prev=>[...prev, { role:"assistant", content:"Network error. Please try again." }]);
      setDiag({ url:getCpChatUrl(), status:"client exception", sample: msg });
    } finally { 
      setBusy(false); 
    }
  }

  function onKeyDown(e: React.KeyboardEvent) { 
    if (e.key==="Enter" && !e.shiftKey) { 
      e.preventDefault(); 
      sendMessage(); 
    } 
  }

  async function pingFunction() {
    const full=getCpChatUrl(); 
    setDiag({ url: full, status: "GET …" });
    try {
      const r1 = await pingCpChat();
      const r2 = await callCpChat({ user_input: "ping" });
      setDiag({ 
        url: full, 
        status:`GET ${r1.status} ${r1.statusText} • POST ${r2.status} ${r2.statusText}`, 
        sample:{ get:r1.data, post:r2.data } 
      });
    } catch (e:any) { 
      setLastError(`Ping exception: ${e?.message ?? "Unknown"}`); 
    }
  }

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'hsl(var(--chat-background))' }}>
      {/* Header - Minimal like ChatGPT */}
      <header className="flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">CoPilot Chat</h1>
              <p className="text-sm text-muted-foreground">Your Lovable project assistant</p>
            </div>
            <button 
              onClick={pingFunction} 
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 text-muted-foreground transition-colors"
            >
              Test Connection
            </button>
          </div>
          {lastError && <Banner kind="error">{lastError}</Banner>}
          {diag && (
            <div className="mt-2 p-3 rounded-lg bg-muted/30 text-xs font-mono text-muted-foreground">
              <div>Status: {diag.status}</div>
              {typeof diag.sample === "string" ? (
                <pre className="mt-1 whitespace-pre-wrap">{diag.sample}</pre>
              ) : diag.sample ? (
                <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(diag.sample, null, 2)}</pre>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-6">
            {messages.map((message, index) => {
              const env = (message as any).envelope as Envelope | undefined;
              const usage = env?.meta?.usage;
              const model = env?.meta?.model;
              const temp = env?.meta?.temperature;
              const cost = usage?.cost;
              
              return (
                <div 
                  key={index} 
                  className={`flex animate-fade-in ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Message Content */}
                  <div className={`max-w-[70%]`}>
                    <div 
                      className={`inline-block p-4 rounded-2xl ${
                        message.role === "user"
                          ? "text-white"
                          : "text-foreground"
                      }`}
                      style={{
                        backgroundColor: message.role === "user" 
                          ? 'hsl(var(--user-bubble))' 
                          : 'hsl(var(--assistant-bubble))'
                      }}
                    >
                      <div className="text-[15px] leading-[1.6] whitespace-pre-wrap">
                        {message.content}
                      </div>

                      {/* Assistant-specific content */}
                      {message.role === "assistant" && (
                        <>
                          {env?.block?.content && (
                            <div className="mt-3 flex items-center gap-2">
                              <CopyPromptButton content={env.block.content} />
                              <span className="text-xs text-muted-foreground">
                                {env.block.language === "lovable-prompt" ? "Prompt ready" : "Code ready"}
                              </span>
                            </div>
                          )}

                          {env?.status?.next_question && (
                            <div className="mt-3 p-3 rounded-lg bg-white">
                              <div className="text-xs font-medium text-muted-foreground mb-1">Next Question:</div>
                              <div className="text-xs text-muted-foreground">{env.status.next_question}</div>
                            </div>
                          )}

                          {env?.confidence === "low" && (
                            <div className="mt-2 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                              Low confidence - consider rephrasing
                            </div>
                          )}

                          {(usage || model) && (
                            <div className="mt-3 text-[10px] text-muted-foreground/70 border-t border-border/30 pt-2">
                              {model && `${model}${typeof temp === "number" ? `@${temp}` : ""}`}
                              {usage && ` • ${usage.prompt_tokens}/${usage.completion_tokens}/${usage.total_tokens} tokens`}
                              {cost && ` • $${cost.total_usd.toFixed(4)}`}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      {/* Input Area - ChatGPT style */}
      <footer className="flex-shrink-0 border-t border-border bg-background">
        <div className="max-w-4xl mx-auto p-4">
          <div className="relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message..."
              disabled={busy}
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 pr-12 text-[15px] leading-[1.6] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 disabled:opacity-50 min-h-[52px] max-h-[200px]"
              rows={1}
              style={{
                height: 'auto',
                minHeight: '52px'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
            />
            <button
              onClick={sendMessage}
              disabled={busy || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {busy ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground text-center">
            Press Enter to send • Shift+Enter for new line
          </div>
        </div>
      </footer>
    </div>
  );
}