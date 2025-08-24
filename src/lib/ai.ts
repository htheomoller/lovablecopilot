/**
 * AI client for edge function calls
 * Uses environment:
 *   • VITE_SUPABASE_URL
 *   • VITE_SUPABASE_ANON_KEY (AKA publishable key)
 */
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

if (!url || !anon) {
  // Surface early for DEV
  console.warn("Missing VITE_SUPABASE_URL or ANON/PUBLISHABLE key");
}

async function call(mode: "ping" | "chat" | "extract" | "roadmap", body: Record<string, any>) {
  const endpoint = `${url}/functions/v1/ai-generate`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anon || "",
      "Authorization": `Bearer ${anon || ""}`,
    },
    body: JSON.stringify({ mode, ...body }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch { /* non-JSON */ }
  if (!res.ok || !json) {
    throw new Error(`Non-JSON from edge (status ${res.status}): ${raw?.slice(0, 200)}`);
  }
  return { ok: res.ok, status: res.status, json, raw };
}

export async function aiPing() { return call("ping", {}); }
export async function aiChat(prompt: string) { return call("chat", { prompt }); }
export async function aiExtract(prompt: string) { return call("extract", { prompt }); }
export async function aiRoadmap(answers: any) { return call("roadmap", { answers }); }