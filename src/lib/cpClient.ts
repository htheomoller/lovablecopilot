/**
 * cpClient — hardened: invoke with explicit headers + manual fetch fallback.
 */
import { createClient } from "@supabase/supabase-js";

export function getSupabaseEnv() {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
  return { url: url.replace(/\/+$/, ""), anon };
}

export function getSupabaseClient() {
  const { url, anon } = getSupabaseEnv();
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { "x-cp-client": "vite" } }
  });
}

export function getCpChatUrl() {
  const { url } = getSupabaseEnv();
  return `${url}/functions/v1/cp-chat`;
}

/** Low-level fallback using fetch (adds both Authorization and apikey) */
async function fetchFallback(body: any) {
  const { url, anon } = getSupabaseEnv();
  const endpoint = `${url}/functions/v1/cp-chat`;
  const resp = await fetch(endpoint, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anon}`,
      "apikey": anon,
      "x-cp-client": "vite-fallback"
    },
    body: JSON.stringify(body ?? {})
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, data };
}

/** Primary path: supabase.functions.invoke with explicit gateway headers; fallback to manual fetch on failure. */
export async function callCpChat(body: any) {
  const { anon } = getSupabaseEnv();
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.functions.invoke("cp-chat", {
      body: body ?? {},
      headers: {
        // Some gateways require both; include explicitly.
        "Authorization": `Bearer ${anon}`,
        "apikey": anon
      }
    });
    if (error) {
      // Try fallback once
      const fb = await fetchFallback(body);
      if (!fb.ok) return { ok: false, status: fb.status, statusText: fb.statusText, data: { error, fallback: fb.data } };
      return { ok: true, status: 200, statusText: "OK(fallback)", data: fb.data };
    }
    return { ok: true, status: 200, statusText: "OK", data };
  } catch (e: any) {
    // Network/preflight error inside invoke; use fallback
    const fb = await fetchFallback(body);
    if (!fb.ok) return { ok: false, status: fb.status, statusText: fb.statusText, data: { exception: e?.message, fallback: fb.data } };
    return { ok: true, status: 200, statusText: "OK(fallback)", data: fb.data };
  }
}