import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface Message {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      text: "Hi — let's get started building your idea! I'll ask you some questions so I can understand what you want to make. Once I have enough, I'll draft a roadmap. You can interrupt anytime with questions. First, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer.",
      ts: Date.now()
    }]);
  }, []);

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    
    const newMessages = [...messages, { role: "user" as const, text: say, ts: Date.now() }];
    setMessages(newMessages);

    try {
      setBusy(true);
      const res = await fetch("/functions/v1/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: newMessages.map(m => ({ 
            role: m.role, 
            content: m.text 
          })),
        }),
      });
      
      const data = await res.json();
      if (data?.reply) {
        setMessages(prev => [...prev, { role: "assistant", text: data.reply, ts: Date.now() }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", text: `Error: ${data?.error || 'No reply from AI'}`, ts: Date.now() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", text: `Error talking to AI: ${err.message}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chat with Copilot</h1>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>

      <Card className="min-h-[400px] p-4">
        <div className="space-y-4 mb-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] p-3 rounded-lg ${
                m.role === "user" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              }`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-muted p-3 rounded-lg">
                <div className="animate-pulse">AI is thinking...</div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !busy ? send() : undefined}
          placeholder="Type your message…"
          disabled={busy}
        />
        <Button onClick={send} disabled={busy || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}