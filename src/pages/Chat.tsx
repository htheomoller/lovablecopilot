import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { callEdge } from "@/lib/edgeClient";

interface Message {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState("");

  useEffect(() => {
    setMessages([{
      role: "assistant",
      text: "Hi — let's get started building your idea! I'll ask you some questions so I can understand what you want to make. Once I have enough, I'll draft a roadmap. You can interrupt anytime with questions. First, how should I talk to you? Say: ELI5 (super simple), Intermediate, or Developer.",
      ts: Date.now()
    }]);
  }, []);

  async function testPing() {
    setDiagnostics("Testing ai-generate ping...");
    const result = await callEdge({ mode: "ping" });
    setDiagnostics(JSON.stringify(result, null, 2));
  }

  async function testHello() {
    setDiagnostics("Testing hello function...");
    const result = await callEdge({ test: "hello" }, "hello");
    setDiagnostics(JSON.stringify(result, null, 2));
  }

  async function send() {
    const say = input.trim();
    if (!say) return;
    setInput("");
    
    const newMessages = [...messages, { role: "user" as const, text: say, ts: Date.now() }];
    setMessages(newMessages);

    try {
      setBusy(true);
      const result = await callEdge({
        mode: "chat",
        prompt: say,
        messages: newMessages.map(m => ({ 
          role: m.role, 
          content: m.text 
        })),
      });
      
      if (result.ok && result.json?.reply) {
        setMessages(prev => [...prev, { role: "assistant", text: result.json.reply, ts: Date.now() }]);
      } else {
        const errorMsg = result.json?.error || result.raw || 'No reply from AI';
        setMessages(prev => [...prev, { role: "assistant", text: `Error: ${errorMsg}`, ts: Date.now() }]);
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={testPing}>
            Test AI
          </Button>
          <Button variant="outline" size="sm" onClick={testHello}>
            Test Hello
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      </div>

      {diagnostics && (
        <Card className="p-4 bg-muted/50">
          <h3 className="text-sm font-medium mb-2">Function Diagnostics:</h3>
          <pre className="text-xs overflow-auto">{diagnostics}</pre>
          <Button variant="ghost" size="sm" onClick={() => setDiagnostics("")} className="mt-2">
            Clear
          </Button>
        </Card>
      )}

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