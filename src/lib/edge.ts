export async function callEdge(prompt: string, mode: 'chat'|'nlu' = 'chat') {
  const url = 'https://yjfqfnmrsdfbvlyursdi.supabase.co/functions/v1/ai-generate';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // send anon key so Supabase gateway accepts the call when needed
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ mode, prompt })
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    return { success:false, error:'non_json', raw:text };
  }
}