import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { aiGenerateRoadmap } from '@/lib/ai'
import { logBreadcrumb } from '@/lib/devlog'
import {
  type ChatSession,
  type AnswerStyle,
  type Message,
  QUESTIONS,
  loadSession,
  saveSession,
  clearSession,
  hasStoredSession,
  addMessage,
  defaultSession,
  generateMilestones
} from '@/lib/chatWizard'

export default function Chat() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [session, setSession] = useState<ChatSession>(defaultSession)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [customFeature, setCustomFeature] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const [lastSaved, setLastSaved] = useState<number>(0)

  // Load session on mount
  useEffect(() => {
    const loaded = loadSession()
    setSession(loaded)
    if (loaded.step >= QUESTIONS.length && !loaded.completed) {
      setShowSummary(true)
    }
  }, [])

  // Auto-save session
  const updateSession = (newSession: ChatSession) => {
    setSession(newSession)
    saveSession(newSession)
    setLastSaved(Date.now())
  }

  const handleStyleSelection = (style: AnswerStyle) => {
    const updatedSession = {
      ...session,
      answerStyle: style,
      step: 0
    }
    
    const withMessage = addMessage(updatedSession, 'assistant', 
      `Great! I'll explain things at the ${style} level. ${QUESTIONS[0].prompt}`
    )
    
    updateSession(withMessage)
  }

  const handleAnswer = (answer: string | string[]) => {
    if (session.step < 0 || session.step >= QUESTIONS.length) return
    
    const question = QUESTIONS[session.step]
    const updatedAnswers = {
      ...session.answers,
      [question.key]: answer
    }
    
    const answerText = Array.isArray(answer) ? answer.join(', ') : answer
    let newSession = addMessage(session, 'user', answerText)
    newSession.answers = updatedAnswers
    
    const nextStep = session.step + 1
    if (nextStep < QUESTIONS.length) {
      newSession = addMessage(newSession, 'assistant', QUESTIONS[nextStep].prompt)
      newSession.step = nextStep
    } else {
      newSession = addMessage(newSession, 'assistant', 
        "Perfect! I have all the information I need. Let me show you a summary of your project."
      )
      newSession.step = QUESTIONS.length
      setShowSummary(true)
    }
    
    updateSession(newSession)
  }

  const handleTextInput = () => {
    if (!input.trim()) return
    handleAnswer(input.trim())
    setInput('')
  }

  const handleMultiSelect = (option: string) => {
    const question = QUESTIONS[session.step]
    const currentAnswers = session.answers[question.key] || []
    
    let newAnswers: string[]
    if (currentAnswers.includes(option)) {
      newAnswers = currentAnswers.filter((a: string) => a !== option)
    } else {
      newAnswers = [...currentAnswers, option]
    }
    
    const updatedSession = {
      ...session,
      answers: {
        ...session.answers,
        [question.key]: newAnswers
      }
    }
    
    updateSession(updatedSession)
  }

  const handleAddCustomFeature = () => {
    if (!customFeature.trim()) return
    
    const question = QUESTIONS[session.step]
    const currentAnswers = session.answers[question.key] || []
    const newAnswers = [...currentAnswers, customFeature.trim()]
    
    const updatedSession = {
      ...session,
      answers: {
        ...session.answers,
        [question.key]: newAnswers
      }
    }
    
    updateSession(updatedSession)
    setCustomFeature('')
  }

  const generateRoadmap = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to generate your roadmap.",
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)
    
    try {
      // Generate roadmap with AI
      const aiResponse = await aiGenerateRoadmap(session.answers, session.answerStyle)
      
      let newSession = addMessage(session, 'assistant', aiResponse.reply)
      
      // Generate and insert milestones
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
          answer_style: session.answerStyle
        },
        tags: ['onboarding', 'roadmap', 'milestones']
      })
      
      newSession = addMessage(newSession, 'assistant', 
        `🎉 Roadmap created! I've added ${milestones.length} milestones to your project. Check the Roadmap tab to see your development plan.`
      )
      
      newSession.completed = true
      updateSession(newSession)
      
      toast({
        title: "Roadmap created!",
        description: `Generated ${milestones.length} milestones for your project.`
      })
      
    } catch (error: any) {
      console.error('Roadmap generation error:', error)
      const errorSession = addMessage(session, 'assistant', 
        `Sorry, I encountered an error generating your roadmap: ${error.message}. Please try again.`
      )
      updateSession(errorSession)
      
      toast({
        title: "Error",
        description: "Failed to generate roadmap. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const startNew = () => {
    clearSession()
    setSession(defaultSession())
    setShowSummary(false)
    setInput('')
  }

  const resumeSession = () => {
    const loaded = loadSession()
    setSession(loaded)
    if (loaded.step >= QUESTIONS.length && !loaded.completed) {
      setShowSummary(true)
    }
  }

  const copyToClipboard = () => {
    const summary = `Project Summary:
App Idea: ${session.answers.idea || 'Not specified'}
Target Audience: ${session.answers.audience || 'Not specified'}
Key Features: ${Array.isArray(session.answers.features) ? session.answers.features.join(', ') : session.answers.features || 'Not specified'}
Privacy: ${session.answers.privacy || 'Not specified'}
Authentication: ${session.answers.auth || 'Not specified'}
Daily Work Hours: ${session.answers.deep_work_hours || 'Not specified'}`

    navigator.clipboard.writeText(summary)
    toast({
      title: "Copied!",
      description: "Project summary copied to clipboard."
    })
  }

  const currentQuestion = session.step >= 0 && session.step < QUESTIONS.length 
    ? QUESTIONS[session.step] 
    : null

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
        <h1 className="text-2xl font-bold">Project Setup Chat</h1>
        <div className="flex gap-2 items-center">
          {hasStoredSession() && (
            <>
              <Button variant="outline" size="sm" onClick={resumeSession}>
                Resume Session
              </Button>
              <Button variant="outline" size="sm" onClick={startNew}>
                Start New
              </Button>
            </>
          )}
          {lastSaved > 0 && (
            <Badge variant="secondary" className="text-xs">
              ✓ autosaved
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Indicator */}
      {session.step >= 0 && session.step < QUESTIONS.length && (
        <div className="mb-4">
          <div className="text-sm text-muted-foreground mb-2">
            Step {session.step + 1} of {QUESTIONS.length}
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((session.step + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 border rounded-lg bg-muted/30">
        {session.messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
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
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-card text-card-foreground mr-4 border p-3 rounded-lg">
              <div className="animate-pulse">Creating your roadmap...</div>
            </div>
          </div>
        )}
      </div>

      {/* Answer Style Selection */}
      {session.step === -1 && (
        <div className="mb-4">
          <div className="text-sm text-muted-foreground mb-2">Choose your preferred explanation style:</div>
          <div className="flex gap-2">
            {(['eli5', 'intermediate', 'developer'] as AnswerStyle[]).map(style => (
              <Chip
                key={style}
                onClick={() => handleStyleSelection(style)}
                className="cursor-pointer"
              >
                {style === 'eli5' ? 'ELI5 (Simple)' : 
                 style === 'intermediate' ? 'Intermediate' : 'Developer'}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Current Question Interface */}
      {currentQuestion && (
        <div className="mb-4">
          {currentQuestion.type === 'text' && (
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleTextInput()}
                placeholder="Type your answer..."
                className="flex-1"
              />
              <Button onClick={handleTextInput} disabled={!input.trim()}>
                Submit
              </Button>
            </div>
          )}

          {currentQuestion.type === 'single-select' && (
            <div className="flex flex-wrap gap-2">
              {currentQuestion.options?.map(option => (
                <Chip
                  key={option}
                  onClick={() => handleAnswer(option)}
                  selected={session.answers[currentQuestion.key] === option}
                  className="cursor-pointer"
                >
                  {option}
                </Chip>
              ))}
            </div>
          )}

          {currentQuestion.type === 'multi-select' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {currentQuestion.options?.map(option => (
                  <Chip
                    key={option}
                    onClick={() => handleMultiSelect(option)}
                    selected={(session.answers[currentQuestion.key] || []).includes(option)}
                    className="cursor-pointer"
                  >
                    {option}
                  </Chip>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={customFeature}
                  onChange={(e) => setCustomFeature(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCustomFeature()}
                  placeholder="Add custom feature..."
                  className="flex-1"
                />
                <Button onClick={handleAddCustomFeature} disabled={!customFeature.trim()}>
                  Add
                </Button>
              </div>
              <Button 
                onClick={() => handleAnswer(session.answers[currentQuestion.key] || [])}
                disabled={!session.answers[currentQuestion.key]?.length}
                className="w-full"
              >
                Continue with {(session.answers[currentQuestion.key] || []).length} feature(s)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Summary Card */}
      {showSummary && !session.completed && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Project Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div><strong>App Idea:</strong> {session.answers.idea}</div>
            <div><strong>Target Audience:</strong> {session.answers.audience}</div>
            <div><strong>Key Features:</strong> {Array.isArray(session.answers.features) ? session.answers.features.join(', ') : session.answers.features}</div>
            <div><strong>Privacy:</strong> {session.answers.privacy}</div>
            <div><strong>Authentication:</strong> {session.answers.auth}</div>
            <div><strong>Daily Work Hours:</strong> {session.answers.deep_work_hours}</div>
            <div className="flex gap-2 pt-4">
              <Button onClick={generateRoadmap} disabled={isLoading} className="flex-1">
                {isLoading ? 'Generating...' : 'Generate Roadmap'}
              </Button>
              <Button variant="outline" onClick={copyToClipboard}>
                Copy Summary
              </Button>
              <Button variant="outline" onClick={() => {
                setSession({...session, step: 0})
                setShowSummary(false)
              }}>
                Edit Answers
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}