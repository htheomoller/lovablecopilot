/**
 * Minimal client for our Supabase Edge function.
 * Always POST JSON and expect JSON back.
 */
export type EdgeMode = "ping" | "chat";
export type EdgeReply =
  | { success: true; mode: EdgeMode; reply?: string; [k: string]: any }
  | { success: false; error: string };

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Surface this early in UI; caller can show it nicely.
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

const endpoint = `${url}/functions/v1/ai-generate`;

export async function callEdge(prompt: string, mode: EdgeMode = "chat"): Promise<EdgeReply & { raw?: string; status?: number; endpoint: string }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anon}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode, prompt }),
    });

    const status = res.status;
    const raw = await res.text();

    // 404/HTML guard
    if (!res.ok) {
      return { success: false, error: `Edge returned ${status}`, raw, status, endpoint };
    }
    // JSON parse guard
    try {
      const json = JSON.parse(raw);
      return { ...json, raw, status, endpoint };
    } catch {
      return { success: false, error: "Non-JSON from edge", raw, status, endpoint };
    }
  } catch (err: any) {
    return { success: false, error: String(err?.message || err), endpoint };
  }
}

export function edgeInfo() {
  return { endpoint, url, hasKeys: Boolean(url && anon) };
}