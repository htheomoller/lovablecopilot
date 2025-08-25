/* Why: single source for moderated onboarding steps */
export type StepKey = 'project_name' | 'audience' | 'goals' | 'features' | 'integrations' | 'effort_hours'

export const ONBOARDING_STEPS: { key: StepKey; question: string; required?: boolean }[] = [
  { key: 'project_name',  question: 'What is your project called? (you can change later)', required: true },
  { key: 'audience',      question: 'Who is it for? (e.g., illustrators, pet owners, teachers)' },
  { key: 'goals',         question: 'What problem are you solving in one sentence?' },
  { key: 'features',      question: 'List 3–5 core features you want first.' },
  { key: 'integrations',  question: 'Any integrations you need? (e.g., Google auth, Stripe, Supabase, image APIs)' },
  { key: 'effort_hours',  question: 'How many hours/day can you work on this? (just a number for planning)' }
]

/* Dumb milestone shaping: turn answers into 2 starter milestones */
export function shapeMilestones(answers: Record<string, string>, ownerId: string) {
  const today = new Date()
  const projectName = (answers.project_name || 'My App').trim()
  const milestoneId = Date.now().toString()
  
  return [
    {
      id: `setup-${milestoneId}`,
      owner_id: ownerId,
      name: 'Project Setup',
      project: projectName,
      status: 'in_progress',
      start_date: today.toISOString().split('T')[0],
      duration_days: 3
    },
    {
      id: `onboarding-${milestoneId}`,
      owner_id: ownerId,
      name: 'Feature Development',
      project: projectName,
      status: 'pending',
      start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      duration_days: 7
    }
  ]
}