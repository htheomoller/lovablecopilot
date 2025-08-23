import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'onboarding',
      role: 'assistant',
      content: "Hi, I'm your Copilot. Tell me about your app idea and I'll help turn it into a roadmap.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Helper function to detect if response contains project idea and audience
  function detectProjectAndAudience(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Look for project/app indicators
    const hasProjectIndicators = /\b(app|application|project|platform|service|tool|website|product)\b/.test(lowerText);
    
    // Look for audience indicators  
    const hasAudienceIndicators = /\b(users?|customers?|people|audience|target|for|help|serve|designed for)\b/.test(lowerText);
    
    return hasProjectIndicators && hasAudienceIndicators;
  }

  // Function to seed initial milestones
  async function seedMilestones(aiResponse: string) {
    if (!user) return;

    const milestoneId = Date.now().toString();
    const milestones = [
      {
        id: `setup-${milestoneId}`,
        project: 'CoPilot',
        name: 'Setup & Auth',
        status: 'planned',
        duration_days: 4,
        owner_id: user.id,
        start_date: new Date().toISOString().split('T')[0]
      },
      {
        id: `chat-${milestoneId}`,
        project: 'CoPilot', 
        name: 'Chat Onboarding',
        status: 'planned',
        duration_days: 6,
        owner_id: user.id,
        start_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      },
      {
        id: `roadmap-${milestoneId}`,
        project: 'CoPilot',
        name: 'Roadmap & Health', 
        status: 'planned',
        duration_days: 3,
        owner_id: user.id,
        start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    ];

    try {
      const { error } = await supabase.from('ledger_milestones').insert(milestones);
      
      if (!error) {
        // Log breadcrumb for successful seeding
        await supabase.from('dev_breadcrumbs').insert({
          owner_id: user.id,
          scope: 'onboarding',
          summary: 'auto_milestones',
          details: { 
            ai_response: aiResponse,
            milestones_created: milestones.length,
            milestone_names: milestones.map(m => m.name)
          },
          tags: ['onboarding', 'milestones', 'auto-seed']
        });
      }
    } catch (error) {
      console.error('Error seeding milestones:', error);
    }
  }

  async function sendMessage() {
    if (!input.trim() || !user || isLoading) return;

    const userMessage = input.trim();
    const messageId = Date.now().toString();
    
    // Add user message to chat
    const userMsg: Message = {
      id: messageId,
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Call the AI generate edge function
      const response = await fetch('https://yjfqfnmrsdfbvlyursdi.supabase.co/functions/v1/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: userMessage })
      });

      const data = await response.json();
      
      let assistantContent: string;
      if (data.success && data.generatedText) {
        assistantContent = data.generatedText;
      } else {
        assistantContent = "Error calling AI service, please try again.";
      }

      // Add assistant message to chat
      const assistantMsg: Message = {
        id: messageId + '_assistant',
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMsg]);

      // Log breadcrumb with input/output
      await supabase.from('dev_breadcrumbs').insert({
        owner_id: user.id,
        scope: 'chat',
        summary: 'AI Chat interaction',
        details: { 
          input: userMessage, 
          output: assistantContent 
        },
        tags: ['chat', 'ai']
      });

      // Check if we should seed milestones based on AI response
      if (data.success && data.generatedText && detectProjectAndAudience(assistantContent)) {
        await seedMilestones(assistantContent);
      }

    } catch (error) {
      console.error('Error calling AI service:', error);
      
      // Add error message
      const errorMsg: Message = {
        id: messageId + '_error',
        role: 'assistant',
        content: "Error calling AI service, please try again.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Chat with AI</h1>
          <p>Please sign in to start chatting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 h-[calc(100vh-8rem)] flex flex-col">
      <h1 className="text-2xl font-bold mb-4">Chat with AI</h1>
      
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 border rounded-lg bg-muted/50">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground">
            Start a conversation with the AI assistant
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground ml-4'
                    : 'bg-card text-card-foreground mr-4 border'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-card text-card-foreground mr-4 border p-3 rounded-lg">
              <div className="animate-pulse">AI is thinking...</div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button 
          onClick={sendMessage} 
          disabled={!input.trim() || isLoading}
        >
          Send
        </Button>
      </div>
    </div>
  );
}