/* Why: tiny helper to call our ai-generate edge function with style + context */
export type AnswerStyle = 'eli5' | 'intermediate' | 'developer'

export async function aiGenerate(prompt: string, { style, context }: { style: AnswerStyle, context?: any }) {
  const res = await fetch('https://yjfqfnmrsdfbvlyursdi.supabase.co/functions/v1/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, answer_style: style, context })
  })
  if (!res.ok) throw new Error(`AI error ${res.status}`)
  return await res.json() as { reply: string; kv?: Record<string, any>; milestones?: any[] }
}

export async function aiGenerateRoadmap(answers: Record<string, any>, style: AnswerStyle) {
  const res = await fetch('https://yjfqfnmrsdfbvlyursdi.supabase.co/functions/v1/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      mode: 'roadmap',
      answer_style: style,
      answers
    })
  })
  if (!res.ok) throw new Error(`AI roadmap error ${res.status}`)
  return await res.json() as { success: boolean; reply: string; mode: string }
}