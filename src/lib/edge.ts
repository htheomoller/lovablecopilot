export async function callEdge(prompt: string, mode: 'chat'|'nlu' = 'chat') {
  const res = await fetch('/functions/v1/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, prompt })
  });

  // Be defensive: some failures return HTML; don't .json() blindly
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!ct.includes('application/json')) {
    throw new Error(`Non-JSON from edge (status ${res.status}): ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Bad JSON from edge');
  }
}