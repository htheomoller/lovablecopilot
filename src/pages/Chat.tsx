import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { logBreadcrumb } from '@/lib/devlog'
import { aiChat, aiNLU, aiRoadmap } from '@/lib/ai'
import {
  type ChatSession,
  type Message,
  loadSession,
  saveSession,
  clearSession,
  defaultSession,
  nextQuestion
} from '@/lib/chatWizard'

export default function Chat() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [session, setSession] = useState<ChatSession>(defaultSession())
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [style, setStyle] = useState<'eli5' | 'intermediate' | 'developer'>('eli5')

  // Load session and initialize greeting
  useEffect(() => {
    const loaded = loadSession()
    setSession(loaded)
    setStyle(loaded.answerStyle)
    
    // Add greeting if no messages
    if (loaded.messages.length === 0) {
      const greeting: Message = {
        role: 'assistant',
        text: "I'll chat naturally and keep notes for your project. First, how technical should I be? (ELI5 • Intermediate • Developer)",
        ts: Date.now()
      }
      const withGreeting = { ...loaded, messages: [greeting] }
      setSession(withGreeting)
      saveSession(withGreeting)
    }
  }, [])

  // Auto-save session on changes
  useEffect(() => {
    if (session.timestamp > 0) {
      saveSession({ ...session, answerStyle: style })
    }
  }, [session, style])

  const addMessage = (role: 'user' | 'assistant', text: string): ChatSession => {
    const message: Message = { role, text, ts: Date.now() }
    return {
      ...session,
      messages: [...session.messages, message],
      timestamp: Date.now()
    }
  }

  const handleSend = async () => {
    const say = input.trim()
    if (!say) return

    const userMsg = addMessage('user', say)
    setSession(userMsg)
    setInput('')
    setIsLoading(true)

    try {
      // Handle style selection
      if (/^(eli5|intermediate|developer)$/i.test(say)) {
        const picked = say.toLowerCase() as 'eli5' | 'intermediate' | 'developer'
        setStyle(picked)
        const bot = addMessage('assistant', `Great — I'll explain like ${picked}. ${nextQuestion(session) || 'Say "generate roadmap" when you\'re ready.'}`)
        setSession(bot)
        setIsLoading(false)
        return
      }

      // Check if we need a field via NLU
      const q = nextQuestion(session)
      
      if (q) {
        // Use NLU to extract structured data
        const nluData = await aiNLU(say, style)
        
        if (nluData.field && nluData.value) {
          const updated = {
            ...userMsg,
            answers: { ...userMsg.answers, [nluData.field]: nluData.value }
          }
          setSession(updated)
          
          const reflect = addMessage('assistant', `Got it: **${nluData.field}** → "${nluData.value}". ${nextQuestion(updated) || 'If everything looks right, say: generate roadmap.'}`)
          setSession(reflect)
        } else {
          // Friendlier, contextual clarification with example based on the next required field
          const next = nextQuestion(session);
          const examples: Record<string, string> = {
            "Tell me your app idea in one short line (what it does).": 'e.g., "AI photo restoration for old family pictures."',
            "Do you have a name? If not, say 'invent one'.": 'e.g., "RetroFix" or "invent one".',
            "Who is it for (ideal user)?": 'e.g., "Families with old albums"',
            "List top 2–3 must-have features (comma separated).": 'e.g., "upload, scratch removal, colorize"',
            "Data visibility: Private, Share via link, or Public?": "Reply with: Private / Share via link / Public",
            "Sign-in: Google OAuth, Magic email link, or None (dev only)?": "Reply with: Google OAuth / Magic email link / None",
            "Daily focused work hours: 0.5, 1, 2, or 4+?": "Reply with: 0.5 / 1 / 2 / 4+"
          };
          const tip = next ? `\n\nExample: ${examples[next] || ""}` : "";
          const fallback = addMessage('assistant', (nluData.reply || "Got it, could you phrase that more clearly?") + tip)
          setSession(fallback)
        }
        setIsLoading(false)
        return
      }

      // Handle roadmap generation
      if (/^generate roadmap$/i.test(say)) {
        if (!user) {
          toast({
            title: "Authentication required",
            description: "Please sign in to generate your roadmap.",
            variant: "destructive"
          })
          setIsLoading(false)
          return
        }

        const roadmapData = await aiRoadmap(session.answers, style)
        
        // Generate milestones (using existing generateMilestones logic)
        const milestones = generateMilestones(session.answers, user.id)
        const { error } = await supabase.from('ledger_milestones').insert(milestones)
        
        if (error) throw error
        
        // Log breadcrumb
        await logBreadcrumb({
          scope: 'chat',
          summary: 'roadmap_generated',
          details: {
            answers: session.answers,
            milestones_count: milestones.length,
            answer_style: style
          },
          tags: ['onboarding', 'roadmap', 'milestones']
        })
        
        let bot = addMessage('assistant', roadmapData.reply || 'Roadmap ready!')
        bot = addMessage('assistant', `🎉 I've generated ${milestones.length} milestones — check the Roadmap tab.`)
        bot.completed = true
        setSession(bot)
        
        toast({
          title: "Roadmap created!",
          description: `Generated ${milestones.length} milestones for your project.`
        })
        
        setIsLoading(false)
        return
      }

      // General chat mode
      const chatData = await aiChat(say, style)
      const bot = addMessage('assistant', chatData.reply || 'I\'m here to help!')
      setSession(bot)
      
    } catch (error: any) {
      console.error('Chat error:', error)
      const errorBot = addMessage('assistant', `Sorry, I encountered an error: ${error.message}`)
      setSession(errorBot)
      
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      })
    }
    
    setIsLoading(false)
  }

  const startNew = () => {
    clearSession()
    const fresh = defaultSession()
    const greeting: Message = {
      role: 'assistant',
      text: "I'll chat naturally and keep notes for your project. First, how technical should I be? (ELI5 • Intermediate • Developer)",
      ts: Date.now()
    }
    const withGreeting = { ...fresh, messages: [greeting] }
    setSession(withGreeting)
    saveSession(withGreeting)
    setStyle('eli5')
    setInput('')
  }

  // Helper function for milestone generation (simplified version)
  const generateMilestones = (answers: Record<string, any>, userId: string) => {
    const deepWorkMultiplier = {
      '0.5': 2.0,
      '1': 1.5,
      '2': 1.0,
      '4+': 0.8
    }[answers.deep_work_hours] || 1.0

    const authComplexity = {
      'Google OAuth': 3,
      'Magic email link': 2,
      'None (dev only)': 1
    }[answers.auth] || 2

    const baseDate = new Date()
    const addDays = (days: number) => {
      const date = new Date(baseDate)
      date.setDate(date.getDate() + Math.ceil(days * deepWorkMultiplier))
      return date.toISOString().split('T')[0]
    }

    let currentDay = 0

    return [
      {
        id: `setup-${Date.now()}`,
        project: answers.idea?.slice(0, 50) || 'My App',
        name: 'Setup & Auth',
        status: 'planned',
        duration_days: Math.ceil((3 + authComplexity) * deepWorkMultiplier),
        owner_id: userId,
        start_date: addDays(currentDay)
      },
      {
        id: `core-${Date.now() + 1}`,
        project: answers.idea?.slice(0, 50) || 'My App',
        name: 'Core Features',
        status: 'planned',
        duration_days: Math.ceil((5 + (answers.features?.length || 3) * 1.5) * deepWorkMultiplier),
        owner_id: userId,
        start_date: addDays(currentDay += Math.ceil((3 + authComplexity) * deepWorkMultiplier))
      },
      {
        id: `polish-${Date.now() + 2}`,
        project: answers.idea?.slice(0, 50) || 'My App',
        name: 'Polish & Deploy',
        status: 'planned',
        duration_days: Math.ceil(2 * deepWorkMultiplier),
        owner_id: userId,
        start_date: addDays(currentDay += Math.ceil((5 + (answers.features?.length || 3) * 1.5) * deepWorkMultiplier))
      }
    ]
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Chat with AI</h1>
          <p>Please sign in to start your guided onboarding.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Project Chat</h1>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={startNew}>
            Start New
          </Button>
          <Badge variant="secondary" className="text-xs">
            {style} mode
          </Badge>
        </div>
      </div>

      <div className="flex flex-col h-full">
        {/* Captured summary */}
        <div className="flex flex-wrap gap-2 p-3 border-b bg-muted/30 text-xs">
          {['idea','name','audience','features','privacy','auth','deep_work_hours'].map(key => (
            session.answers?.[key] ? (
              <span key={key} className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">
                {key}: {Array.isArray(session.answers[key]) ? session.answers[key].join(', ') : session.answers[key]}
              </span>
            ) : null
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {session.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-card text-card-foreground border p-3 rounded-2xl">
                <div className="animate-pulse">Thinking...</div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2 p-3 border-t">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
            placeholder="Type your response..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}