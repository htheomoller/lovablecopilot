/**
 * cpClient — tiny helper to call the cp-chat Edge Function from a Vite app.
 * Normalizes URL, sets required headers, and provides a ping method for diagnostics.
 */
export function getSupabaseEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return {
    url: url ? url.replace(/\/+$/, '') : "",
    anon: anon ?? ""
  };
}

export function getCpChatUrl() {
  const { url } = getSupabaseEnv();
  return `${url}/functions/v1/cp-chat`;
}

export async function callCpChat(body: any) {
  const { anon } = getSupabaseEnv();
  const resp = await fetch(getCpChatUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Both required on hosted Supabase Functions
      "Authorization": `Bearer ${anon}`,
      "apikey": anon
    },
    body: JSON.stringify(body ?? {})
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep text raw for debug */ }
  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, data: json ?? text };
}