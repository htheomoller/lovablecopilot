export async function callEdge(prompt: string, mode: 'chat'|'nlu' = 'chat') {
  const url = '/functions/v1/ai-generate'; // Supabase proxy path; works in Lovable preview
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, prompt })
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from edge (status ${res.status}):\n${text.slice(0,300)}`);
  }
}