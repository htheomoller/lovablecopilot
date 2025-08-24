export type AiMode = 'chat'|'nlu'|'roadmap'|'ping';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-generate`;

async function callAi(mode: AiMode, body: Record<string, any>) {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ ...body, mode })
  });
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) {
    console.error('AI error status', res.status, text);
    throw new Error(`AI ${res.status}: ${text.slice(0,200)}`);
  }
  try { return ct.includes('application/json') ? JSON.parse(text) : { reply: text }; }
  catch (e) { console.error('Bad JSON from AI:', text); throw new Error('AI returned non‑JSON response'); }
}

export const aiChat = (prompt: string, answer_style: string) => callAi('chat', { prompt, answer_style });
export const aiNLU  = (prompt: string, answer_style: string) => callAi('nlu',  { prompt, answer_style });
export const aiRoadmap = (answers: any, answer_style: string) => callAi('roadmap', { answers, answer_style });
export const aiPing = () => callAi('ping', {});