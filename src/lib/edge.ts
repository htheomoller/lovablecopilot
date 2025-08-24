// Helper that calls the edge function via the direct invoke URL.
// This avoids any local proxy/path confusion in preview/iframe environments.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) console.warn("VITE_SUPABASE_URL is not set");
if (!SUPABASE_ANON_KEY) console.warn("VITE_SUPABASE_ANON_KEY is not set");

const INVOKE_URL = `${SUPABASE_URL}/functions/v1/ai-generate`;

export async function callEdgeEcho(prompt: string) {
  const res = await fetch(INVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // BOTH headers are recommended by Supabase when invoking from the browser:
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ prompt }),
  });

  // If the function path is wrong or not deployed, Supabase returns HTML (404 page).
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response from edge (status ${res.status}). This usually means 404/HTML. ` +
      `Body preview: ${text.slice(0, 200)}`
    );
  }
}