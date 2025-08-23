import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { aiGenerate, type AnswerStyle } from '@/lib/ai'
import { ONBOARDING_STEPS, shapeMilestones } from '@/lib/onboardingScript'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [answerStyle, setAnswerStyle] = useState<string>(() => localStorage.getItem('cp_answer_style') || 'eli5');
  const [style, setStyle] = useState<AnswerStyle | null>(null)
  const [stepIndex, setStepIndex] = useState<number>(-1) // -1 until style chosen
  const answersRef = useRef<Record<string, string>>({})
  
  const greetIfEmpty = () => {
    setMessages([{ 
      id: 'greeting',
      role: 'assistant', 
      content: `Hi, I'm your Copilot. First, how technical should I be? Choose: ELI5, Intermediate, or Developer.`,
      timestamp: new Date()
    }]);
  };
  
  useEffect(() => {
    // greet on first load if empty
    setTimeout(() => {
      if (messages.length === 0) greetIfEmpty();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickStyle = (s: string) => { 
    setAnswerStyle(s); 
    localStorage.setItem('cp_answer_style', s); 
    setMessages(m => [...m, { 
      id: Date.now().toString(),
      role: 'assistant', 
      content: `Great — I'll answer like: ${s}. Tell me your app idea.`,
      timestamp: new Date()
    }]); 
  };

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
    if (!input.trim()) return

    // 1) If no style picked yet, interpret quick style words
    if (!style) {
      const normalized = input.trim().toLowerCase()
      const picked: Record<string, AnswerStyle> = { 'eli5':'eli5', 'intermediate':'intermediate', 'developer':'developer' }
      const guess = picked[normalized]
      if (guess) {
        setStyle(guess)
        setMessages(prev => [...prev, { 
          id: Date.now().toString(),
          role: 'user', 
          content: input,
          timestamp: new Date()
        }, { 
          id: Date.now().toString() + '_assistant',
          role: 'assistant', 
          content: `Great — I'll answer like: ${guess}. Let's set up your project.`,
          timestamp: new Date()
        }])
        setStepIndex(0) // start onboarding
        setInput('')
        return
      }
      setMessages(prev => [...prev, { 
        id: Date.now().toString(),
        role: 'user', 
        content: input,
        timestamp: new Date()
      }, { 
        id: Date.now().toString() + '_assistant',
        role: 'assistant', 
        content: 'Please choose one: ELI5, Intermediate, or Developer.',
        timestamp: new Date()
      }])
      setInput('')
      return
    }

    // 2) If onboarding in progress, capture answer and move next
    if (stepIndex >= 0 && stepIndex < ONBOARDING_STEPS.length) {
      const step = ONBOARDING_STEPS[stepIndex]
      answersRef.current[step.key] = input.trim()
      setMessages(prev => [...prev, { 
        id: Date.now().toString(),
        role: 'user', 
        content: input,
        timestamp: new Date()
      }])
      setInput('')
      const nextIndex = stepIndex + 1
      if (nextIndex < ONBOARDING_STEPS.length) {
        const nextQ = ONBOARDING_STEPS[nextIndex].question
        setMessages(prev => [...prev, { 
          id: Date.now().toString() + '_assistant',
          role: 'assistant', 
          content: nextQ,
          timestamp: new Date()
        }])
        setStepIndex(nextIndex)
        return
      }
      // finished onboarding
      setStepIndex(ONBOARDING_STEPS.length)
      const answers = { ...answersRef.current }
      setMessages(prev => [...prev, { 
        id: Date.now().toString() + '_assistant',
        role: 'assistant', 
        content: 'Thanks! Creating your initial roadmap…',
        timestamp: new Date()
      }])

      try {
        // Make a short AI summary for the user (optional flavor)
        const ai = await aiGenerate('Summarize this onboarding into a friendly 3‑bullet plan.', { style, context: answers })
        setMessages(prev => [...prev, { 
          id: Date.now().toString() + '_assistant',
          role: 'assistant', 
          content: ai.reply,
          timestamp: new Date()
        }])

        // Seed milestones into DB
        if (user?.id) {
          const rows = shapeMilestones(answers, user.id)
          const { error } = await supabase.from('ledger_milestones').insert(rows)
          if (error) throw error
          // Breadcrumb
          await supabase.from('dev_breadcrumbs').insert({ 
            owner_id: user.id,
            scope: 'onboarding', 
            summary: 'seed_milestones', 
            details: rows 
          })
          setMessages(prev => [...prev, { 
            id: Date.now().toString() + '_assistant',
            role: 'assistant', 
            content: 'Roadmap seeded. Check the Roadmap tab.',
            timestamp: new Date()
          }])
        } else {
          setMessages(prev => [...prev, { 
            id: Date.now().toString() + '_assistant',
            role: 'assistant', 
            content: 'Log in to save milestones. (You can finish onboarding again later.)',
            timestamp: new Date()
          }])
        }
      } catch (e: any) {
        setMessages(prev => [...prev, { 
          id: Date.now().toString() + '_assistant',
          role: 'assistant', 
          content: `Setup encountered an error: ${e.message}`,
          timestamp: new Date()
        }])
      }
      return
    }

    // 3) Normal chat fallback (after onboarding)
    if (!user || isLoading) return;
    
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
      const ai = await aiGenerate(input, { style, context: { answers: answersRef.current } })
      setMessages(prev => [...prev, { 
        id: messageId + '_assistant',
        role: 'assistant', 
        content: ai.reply,
        timestamp: new Date()
      }])
      setInput('')
    } catch (e: any) {
      setMessages(prev => [...prev, { 
        id: messageId + '_assistant',
        role: 'assistant', 
        content: 'Error calling AI service, please try again.',
        timestamp: new Date()
      }])
      setInput('')
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

      {/* Style chips always visible until chosen */}
      {!style && (
        <div className="flex gap-2 mb-3">
          {(['eli5','intermediate','developer'] as AnswerStyle[]).map(s => (
            <Button 
              key={s} 
              variant="outline" 
              size="sm"
              onClick={() => {
                setStyle(s); 
                setMessages(prev => [...prev, { 
                  id: Date.now().toString() + '_assistant',
                  role:'assistant', 
                  content:`Great — I'll answer like: ${s}. Let's set up your project.`,
                  timestamp: new Date()
                }]); 
                setStepIndex(0);
                // Ask first question immediately
                setTimeout(() => {
                  setMessages(prev => [...prev, { 
                    id: Date.now().toString() + '_assistant',
                    role:'assistant', 
                    content: ONBOARDING_STEPS[0].question,
                    timestamp: new Date()
                  }])
                }, 100);
              }}
            >
              {s.toUpperCase()}
            </Button>
          ))}
        </div>
      )}
      
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