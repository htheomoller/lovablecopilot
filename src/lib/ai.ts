export type EdgeChatMode = 'chat' | 'nlu';

// Robust caller: try relative proxy first, then direct Supabase URL from env
export async function callEdge(prompt: string, mode: EdgeChatMode = 'chat') {
  const rel = '/functions/v1/ai-generate';
  const directBase = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  // helper to fetch and *force* JSON parse (throw on HTML/404)
  const fetchJSON = async (url: string, init: RequestInit) => {
    const r = await fetch(url, init);
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      return { ok: r.ok, status: r.status, json: j };
    } catch {
      throw new Error(`Non-JSON from edge (status ${r.status}):\n${text.slice(0,200)}`);
    }
  };

  const body = JSON.stringify({ mode, prompt });
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(anon ? { 'apikey': anon, 'Authorization': `Bearer ${anon}` } : {}) },
    body
  };

  // 1) try Lovable proxy path
  try {
    const a = await fetchJSON(rel, init);
    if (!a.ok) throw new Error(`Edge error ${a.status}: ${JSON.stringify(a.json)}`);
    return a.json;
  } catch (e1) {
    // 2) fallback to direct Supabase URL
    if (!directBase) throw e1;
    const url = `${directBase.replace(/\/$/, '')}/functions/v1/ai-generate`;
    const b = await fetchJSON(url, init);
    if (!b.ok) throw new Error(`Edge error ${b.status}: ${JSON.stringify(b.json)}`);
    return b.json;
  }
}