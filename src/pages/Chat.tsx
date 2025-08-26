import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  envelope?: Envelope;
}

interface Envelope {
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
  status: {
    complete: boolean;
    missing: string[];
    next_question: string | null;
  };
  suggestions: string[];
  error: { code: string | null; message: string | null };
  meta: { conversation_stage: "discovery" | "planning" | "generating" | "refining"; turn_count: number };
  block: { language: "lovable-prompt" | "ts" | "js" | "json" | null; content: string | null; copy_safe: boolean } | null;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: crypto.randomUUID(), 
      role: 'assistant', 
      content: "Hi! I'm CP. Ask me anything about your Lovable project. When you request code or a Lovable prompt, I'll return it with a Copy button.", 
      timestamp: new Date() 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  const sessionIdRef = useRef(() => crypto.randomUUID());
  
  const turnCount = useMemo(() => {
    return messages.filter(m => m.role === 'user').length;
  }, [messages]);

  const addMessage = (role: 'user' | 'assistant', content: string, envelope?: Envelope) => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: new Date(),
      envelope,
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "Prompt has been copied successfully.",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Add user message
    addMessage('user', userMessage);

    try {
      const response = await fetch('/functions/v1/cp-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          turn_count: turnCount + 1,
          user_input: userMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const envelope: Envelope = await response.json();
      
      // Add assistant message (enforce one message per turn)
      const assistantText = envelope?.reply_to_user ?? 
                           envelope?.error?.message ?? 
                           "I had trouble processing that. Please try again.";
      
      addMessage('assistant', assistantText, envelope);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addMessage('assistant', `Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 h-screen flex flex-col">
      <div className="flex-1 overflow-hidden flex flex-col">
        <h1 className="text-2xl font-bold mb-4">Chat</h1>
        
        {/* Message List */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Start a conversation by typing a message below.
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <Card className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}`}>
                  <CardContent className="p-3">
                    <div className="text-sm font-medium mb-1 capitalize">
                      {message.role}
                    </div>
                    <div className="whitespace-pre-wrap">
                      {message.content}
                    </div>
                    
                    {/* Code block for assistant messages with block.content */}
                    {message.role === 'assistant' && message.envelope?.block?.content && (
                      <div className="mt-3 relative">
                        <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
                          <code>{message.envelope.block.content}</code>
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2"
                          onClick={() => copyToClipboard(message.envelope?.block?.content || '')}
                        >
                          <Copy className="h-3 w-3" />
                          Copy Prompt
                        </Button>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {message.envelope.block.language === "lovable-prompt" ? "Lovable prompt ready" : "Code block ready"}
                        </div>
                      </div>
                    )}
                    
                    {/* Show next question if present */}
                    {message.role === 'assistant' && message.envelope?.status?.next_question && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium">Next:</span> {message.envelope.status.next_question}
                      </div>
                    )}
                    
                    {/* Show low confidence warning */}
                    {message.role === 'assistant' && message.envelope?.confidence === "low" && (
                      <div className="mt-2 text-xs text-amber-600">
                        Confidence is low — consider rephrasing.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))
          )}
          
          {loading && (
            <div className="flex justify-start">
              <Card className="max-w-[80%]">
                <CardContent className="p-3">
                  <div className="text-sm font-medium mb-1">Assistant</div>
                  <div className="text-muted-foreground">Thinking...</div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Message Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}