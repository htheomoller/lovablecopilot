/**
 * AI Edge caller — uses DIRECT Supabase Invoke URL to avoid proxy 404s.
 * Requires:
 *   • VITE_SUPABASE_URL       (e.g. https://.supabase.co)
 *   • VITE_SUPABASE_ANON_KEY  (from Supabase > Project Settings > API)
 */
export type EdgeMode = 'ping' | 'chat' | 'nlu' | 'roadmap';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const AI_PATH = '/functions/v1/ai-generate';

export function currentAiEndpoint() {
  if (!SUPA_URL) return '(missing VITE_SUPABASE_URL)';
  return `${SUPA_URL.replace(/\/+$/,'')}${AI_PATH}`;
}

function ensureEnv() {
  if (!SUPA_URL || !SUPA_ANON) {
    const miss = [
      !SUPA_URL ? 'VITE_SUPABASE_URL' : null,
      !SUPA_ANON ? 'VITE_SUPABASE_ANON_KEY' : null,
    ].filter(Boolean).join(', ');
    throw new Error(`Missing required env: ${miss}`);
  }
}

async function safeJson(res: Response) {
  const text = await res.text();
  try { return { ok: true, json: JSON.parse(text), raw: text, status: res.status }; }
  catch { return { ok: false, json: null, raw: text, status: res.status }; }
}

export async function callEdge(payload: any) {
  ensureEnv();
  const url = currentAiEndpoint();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'Authorization': `Bearer ${SUPA_ANON}`,
      'apikey': SUPA_ANON,
    },
    body: JSON.stringify(payload ?? {}),
  });
  const parsed = await safeJson(res);
  if (!parsed.ok) {
    throw new Error(`Non-JSON from edge (status ${parsed.status}): ${parsed.raw?.slice(0,200)}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Edge error ${res.status}: ${parsed.raw?.slice(0,200)}`);
  }
  return parsed.json;
}

export async function pingEdge() {
  return callEdge({ mode: 'ping' });
}