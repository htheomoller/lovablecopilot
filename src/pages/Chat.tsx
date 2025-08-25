import React, { useEffect, useState } from "react";
import { callConversationAPI } from "@/lib/ai";
import { Chip } from "@/components/ui/chip";

type Msg = { role: "assistant" | "user"; text: string; ts: number };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState<string>();
  const [currentState, setCurrentState] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [chips, setChips] = useState<string[]>([]);

  useEffect(() => {
    // Load initial conversation state
    loadInitialState();
  }, []);

  async function loadInitialState() {
    try {
      const response = await callConversationAPI("");
      if (response.success) {
        const hello: Msg = {
          role: "assistant",
          ts: Date.now(),
          text: response.prompt,
        };
        setMessages([hello]);
        setCurrentState(response.state);
        setAnswers(response.answers);
        setChips(response.ui?.chips || []);
      }
    } catch (e: any) {
      const hello: Msg = {
        role: "assistant",
        ts: Date.now(),
        text: "Hi! Let's build your idea together. How should I talk to you?",
      };
      setMessages([hello]);
    }
  }

  async function onPing() {
    try {
      const res = await callConversationAPI("", "", {}, "ping");
      setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Ping → ${JSON.stringify(res)}` }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Ping error: ${e.message}` }]);
    }
  }

  async function sendMessage(message?: string) {
    const say = (message ?? input).trim();
    if (!say) return;
    
    setInput("");
    setMessages(m => [...m, { role: "user", ts: Date.now(), text: say }]);
    setBusy(true);
    
    try {
      const response = await callConversationAPI(say, currentState, answers);
      
      if (response.success) {
        setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: response.prompt }]);
        
        // Update state
        setCurrentState(response.state);
        setAnswers(response.answers);
        setChips(response.ui?.chips || []);
      } else {
        throw new Error(response.error);
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function handleChipClick(value: string) {
    sendMessage(value);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => window.location.reload()} 
          className="px-3 py-1 rounded border hover:bg-muted"
        >
          Refresh
        </button>
        <button 
          onClick={() => {
            setMessages([]);
            setProjectId(undefined);
            setCurrentState("");
            setAnswers({});
            setChips([]);
            setTimeout(() => window.location.reload(), 20);
          }} 
          className="px-3 py-1 rounded border hover:bg-muted"
        >
          Reset
        </button>
        <button 
          onClick={onPing} 
          className="px-3 py-1 rounded border hover:bg-muted"
        >
          Ping Edge
        </button>
      </div>

      {/* Messages */}
      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div 
              className={`inline-block px-4 py-2 rounded-lg max-w-[80%] ${
                m.role === "user" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground">…thinking</div>}
      </div>

      {/* Quick chips */}
      {chips.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Quick options:</div>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip, index) => (
              <Chip
                key={index}
                onClick={() => handleChipClick(chip)}
                className="cursor-pointer"
              >
                {chip}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" ? sendMessage() : undefined}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button 
          onClick={() => sendMessage()} 
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          Send
        </button>
      </div>

      {/* Debug info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <div>State: {currentState}</div>
        <div>Project: {projectId || "session"}</div>
        <div>Answers: {JSON.stringify(answers)}</div>
      </div>
    </div>
  );
}