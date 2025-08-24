/**
 * Minimal, robust client for our Supabase edge function.
 * Only two modes are supported: "ping" and "chat".
 * All responses are forced to JSON, with helpful error text if not JSON.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
const FN = "ai-generate";
const ENDPOINT = `${BASE}/functions/v1/${FN}`;

type EdgeOk =
  | { success: true; mode: "ping"; reply: string }
  | { success: true; mode: "chat"; reply: string };

type EdgeErr = { success: false; error: string };

function assertEnv() {
  if (!BASE) throw new Error("Missing VITE_SUPABASE_URL");
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY && !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  }
}

async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    const snippet = text.slice(0, 240);
    throw new Error(`Non-JSON from edge (status ${res.status}): ${snippet}`);
  }
}

export async function pingEdge() {
  assertEnv();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey:
        import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization:
        `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ mode: "ping" }),
  });
  if (!res.ok) throw new Error(`Ping failed: ${res.status}`);
  return (await readJsonOrThrow(res)) as EdgeOk | EdgeErr;
}

export async function chatEdge(prompt: string) {
  assertEnv();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey:
        import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization:
        `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    // IMPORTANT: no "nlu" mode anywhere. Only "chat".
    body: JSON.stringify({ mode: "chat", prompt }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
  return (await readJsonOrThrow(res)) as EdgeOk | EdgeErr;
}

export const EDGE_ENDPOINT = ENDPOINT;