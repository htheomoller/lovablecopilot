export type EdgeMode = 'chat'|'nlu';

export async function callEdge(prompt: string, mode: EdgeMode = 'chat') {
  const url = '/functions/v1/ai-nlu'; // Lovable/Supabase proxy
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, prompt })
  });

  // Harden against HTML / 404
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error('Non-JSON response from edge' + (text ? `: ${String(text).slice(0,120)}` : ''));
  }

  const json = await res.json();
  return json;
}