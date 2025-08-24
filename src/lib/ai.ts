// Simple client for our edge function (always returns JSON or throws informative error)
export type Answers = Partial<{
  answer_style: 'eli5' | 'intermediate' | 'developer'
  idea: string
  name: string
  audience: string
  features: string[]
  privacy: 'Private' | 'Share via link' | 'Public'
  auth: 'Google OAuth' | 'Magic email link' | 'None (dev only)'
  deep_work_hours: '0.5' | '1' | '2' | '4+'
}>;

async function postEdge(payload: any) {
  const res = await fetch('/functions/v1/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j;
  } catch {
    throw new Error(`Non-JSON from edge (status ${res.status}):\n${text.slice(0, 400)}`);
  }
}

export async function nlu(prompt: string, answers: Answers, style: Answers['answer_style'] = 'intermediate') {
  return postEdge({ mode: 'nlu', prompt, style, answers });
}

export async function makeRoadmap(answers: Answers, style: Answers['answer_style'] = 'intermediate') {
  return postEdge({ mode: 'roadmap', answers, style });
}