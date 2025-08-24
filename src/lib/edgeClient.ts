/**
 * Tiny client for calling the Supabase Edge Function from the browser.
 * It:
 *   • always sends JSON
 *   • handles non-JSON / HTML responses defensively
 *   • includes apikey header when available (Supabase expects it in some setups)
 */
export async function callEdge(payload: any, functionName: string = "ai-generate") {
  const url =
    (import.meta as any).env?.VITE_SUPABASE_URL?.replace(/\/+$/, "") +
    `/functions/v1/${functionName}`;

  const apikey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apikey ? { apikey, Authorization: `Bearer ${apikey}` } : {})
    },
    body: JSON.stringify(payload ?? {})
  });

  // Try to parse as JSON; if it fails, surface the text so the UI never crashes
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return { ok: res.ok, status: res.status, json: j, raw: text };
  } catch {
    return { ok: false, status: res.status, json: null, raw: text };
  }
}