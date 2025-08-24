export type EdgeResponse =
  | { success: true; mode: string; reply?: string; ok?: boolean; ts?: number }
  | { success: false; error: string };

async function fetchJSON(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from edge (status ${res.status}): ${text.slice(0,200)}`);
  }
}

// Primary: Lovable/Supabase proxy path. This MUST work if the function exists.
const RELATIVE_INVOKE = "/functions/v1/ai-generate";

/**
 * callEdge — small safe wrapper that ALWAYS throws useful errors for non-JSON/404.
 */
export async function callEdge(payload: Record<string, any>): Promise<EdgeResponse> {
  const res = await fetch(RELATIVE_INVOKE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });
  const data = await fetchJSON(res);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function pingEdge(): Promise<EdgeResponse> {
  return callEdge({ mode: "health" });
}