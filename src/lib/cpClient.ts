/**
 * cpClient — Supabase client wrapper for calling Edge Functions safely from Vite.
 * Uses supabase-js functions.invoke to avoid CORS/preflight gotchas.
 */
import { createClient } from "@supabase/supabase-js";

export function getSupabaseEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return {
    url: (url ?? "").replace(/\/+$/, ""),
    anon: anon ?? ""
  };
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

/** Invoke cp-chat via supabase-js. Returns { ok, status, statusText, data }. */
export async function callCpChat(body: any) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("cp-chat", {
    body: body ?? {},
  });

  if (error) {
    // Mirror fetch-like shape for the UI
    return {
      ok: false,
      status: error.status ?? 0,
      statusText: error.message ?? "Invoke error",
      data: { error }
    };
  }
  // cp-chat always returns JSON
  return { ok: true, status: 200, statusText: "OK", data };
}