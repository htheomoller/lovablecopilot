export async function callEdge(prompt: string, mode: 'chat'|'nlu' = 'nlu') {
  const r = await fetch('/functions/v1/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, prompt })
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('Non-JSON response from edge (likely a 404/HTML)');
  }
  return await r.json();
}