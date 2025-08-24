export async function callEdge(prompt: string, mode: 'chat' | 'nlu' = 'chat') {
  const res = await fetch('/functions/v1/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, prompt })
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from edge (status ${res.status}):\n${text.slice(0,200)}`);
  }
}