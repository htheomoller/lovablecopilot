export async function callEdge(prompt: string, mode: 'chat' | 'nlu' = 'chat') {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }
  const endpoint = `${url}/functions/v1/ai-generate`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anon,
      'Authorization': `Bearer ${anon}`
    },
    body: JSON.stringify({ mode, prompt })
  });
  const ct = res.headers.get('Content-Type') || '';
  if (!res.ok || !ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Edge error ${res.status}: ${text.slice(0,200)}`);
  }
  return res.json();
}