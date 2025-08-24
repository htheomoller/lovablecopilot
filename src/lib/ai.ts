/**
 * Centralized Edge Function client (absolute URLs, robust JSON handling).
 * Requires env:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY; edge calls will fail.");
}

const EDGE_AI = `${SUPABASE_URL}/functions/v1/ai-generate`;
const EDGE_HELLO = `${SUPABASE_URL}/functions/v1/hello`;

type EdgeJson = Record<string, any>;

async function fetchJson(url: string, body: EdgeJson): Promise<{ok:boolean;status:number;json?:EdgeJson;raw?:string;error?:string}> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body ?? {})
    });
    const text = await res.text();
    let parsed: any;
    try { parsed = text ? JSON.parse(text) : undefined; } catch {
      return { ok: false, status: res.status, raw: text, error: `Non-JSON from edge (status ${res.status})` };
    }
    return { ok: res.ok, status: res.status, json: parsed, raw: text };
  } catch (e:any) {
    return { ok:false, status:0, error: e?.message || "network_error" };
  }
}

export async function pingEdge() {
  return fetchJson(EDGE_AI, { mode: "ping" });
}

export async function callNlu(prompt: string) {
  return fetchJson(EDGE_AI, { mode: "nlu", prompt });
}

export async function callChat(prompt: string) {
  return fetchJson(EDGE_AI, { mode: "chat", prompt });
}

export async function callRoadmap(payload: EdgeJson) {
  return fetchJson(EDGE_AI, { mode: "roadmap", ...payload });
}

// Fallback quick ping to /hello to verify routing independently of ai-generate
export async function pingHello() {
  return fetchJson(EDGE_HELLO, { mode: "ping" });
}