import { useState } from 'react';
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
}

interface EdgeResponse {
  reply_to_user?: string;
  block?: {
    content: string;
  };
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: new Date(),
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
      const response = await fetch('/functions/v1/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: userMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: EdgeResponse = await response.json();
      
      // Add assistant message (enforce one message per turn)
      if (data.reply_to_user) {
        addMessage('assistant', data.reply_to_user);
      }

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
                    {message.role === 'assistant' && message.content.includes('```') && (
                      <div className="mt-3 relative">
                        <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
                          <code>{message.content.match(/```[\s\S]*?```/)?.[0]?.replace(/```/g, '') || ''}</code>
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2"
                          onClick={() => copyToClipboard(message.content.match(/```[\s\S]*?```/)?.[0]?.replace(/```/g, '') || '')}
                        >
                          <Copy className="h-3 w-3" />
                          Copy Prompt
                        </Button>
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