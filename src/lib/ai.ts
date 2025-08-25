/**
 * Client helper to call our edge function safely.
 * Guarantees JSON-or-throw (translates 404/HTML into a readable error).
 */
const BASE = import.meta.env.VITE_SUPABASE_URL;
const EDGE = `${BASE}/functions/v1/ai-generate`;

export type Level = "ELI5" | "Intermediate" | "Developer";

export async function callEdge(
  prompt: string,
  mode: "chat" | "nlu" | "ping" = "chat",
  ctx?: { level?: Level; answers?: Record<string, unknown>; transcript?: Array<{role:"user"|"assistant"; content:string}> }
) {
  if (mode === "ping") {
    const r = await fetch(`${EDGE}?mode=ping`, { method: "GET" });
    if (!r.ok) throw new Error(`Edge ${r.status}`);
    return await r.json();
  }

  const r = await fetch(EDGE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ mode, prompt, context: ctx ?? {} }),
  });

  // Convert non-JSON to readable error so UI never crashes
  const text = await r.text();
  try {
    const json = JSON.parse(text);
    if (!r.ok) throw new Error(json?.error || `Edge ${r.status}`);
    return json;
  } catch {
    throw new Error(`Non-JSON from edge (status ${r.status}): ${text.slice(0, 160)}`);
  }
}