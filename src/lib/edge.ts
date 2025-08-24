export const EDGE_URL = "https://yjfqfnmrsdfbvlyursdi.supabase.co/functions/v1/ai-generate";

export type EdgeMode = 'chat' | 'nlu' | 'roadmap';

/**
 * Call the Supabase Edge Function directly (no frontend env vars required).
 * Throws helpful errors for non-JSON / 404 HTML responses.
 */
export async function callEdge(prompt: string, mode: EdgeMode = 'chat') {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode })
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge error ${res.status}: ${text.slice(0,200)}`);
  }
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error('Non-JSON response from edge (likely a 404/HTML)');
  }
  return res.json();
}