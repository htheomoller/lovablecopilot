import React, { useEffect, useState } from "react";
import { callConversationAPI } from "@/lib/ai";
import { Chip } from "@/components/ui/chip";

type Msg = { role: "assistant" | "user"; text: string; ts: number };

type ExtractedData = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<ExtractedData>>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    // Load initial conversation state
    loadInitialState();
  }, []);

  async function loadInitialState() {
    try {
      const response = await callConversationAPI("Hi! I'd like to build an app.", {});
      if (response.success) {
        const hello: Msg = {
          role: "assistant",
          ts: Date.now(),
          text: response.reply_to_user,
        };
        setMessages([hello]);
        setExtractedData(response.extracted || {});
        setSuggestions(response.suggestions || []);
        setIsComplete(response.status?.complete || false);
      }
    } catch (e: any) {
      const hello: Msg = {
        role: "assistant",
        ts: Date.now(),
        text: "Hi! Let's build your app idea together. How should I talk to you?",
      };
      setMessages([hello]);
      setSuggestions(["Explain like I'm 5", "Intermediate", "Developer"]);
    }
  }

  async function onPing() {
    try {
      const res = await callConversationAPI("", {}, undefined, "ping");
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
      const response = await callConversationAPI(say, extractedData, extractedData.tone);
      
      if (response.success) {
        if (response.parse_error) {
          setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: `Parse error. Raw response: ${response.raw}` }]);
        } else {
          setMessages(m => [...m, { role: "assistant", ts: Date.now(), text: response.reply_to_user }]);
          
          // Update extracted data
          setExtractedData(response.extracted || {});
          setSuggestions(response.suggestions || []);
          setIsComplete(response.status?.complete || false);
        }
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
            setExtractedData({});
            setSuggestions([]);
            setIsComplete(false);
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
        {isComplete && (
          <div className="px-3 py-1 rounded bg-green-100 text-green-800 text-sm">
            Complete!
          </div>
        )}
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

      {/* Quick suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Quick options:</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <Chip
                key={index}
                onClick={() => handleChipClick(suggestion)}
                className="cursor-pointer"
              >
                {suggestion}
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
        <div>Extracted: {JSON.stringify(extractedData)}</div>
        <div>Complete: {isComplete.toString()}</div>
      </div>
    </div>
  );
}