/**
 * cpClient — extra safety: normalize to envelope on the client as well.
 * If the server ever returns a raw OpenAI completion, we extract content and wrap it.
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

function normalizeEnvelopeFromAny(data: any) {
  // If already envelope-ish, return as-is
  if (data && typeof data === "object" && ("reply_to_user" in data || "success" in data)) return data;
  // If it's a completion, try to unwrap
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.length) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && (parsed.reply_to_user || parsed.success)) return parsed;
      const reply = parsed?.response || parsed?.reply || parsed?.message || content;
      return {
        success: true,
        mode: "chat",
        session_id: "unknown",
        turn_id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        reply_to_user: String(reply),
        confidence: "high",
        extracted: { tone: "developer", idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null },
        status: { complete: false, missing: [], next_question: null },
        suggestions: [],
        error: { code: null, message: null },
        meta: { conversation_stage: "planning", turn_count: 0 },
        block: null
      };
    } catch {
      // content not JSON, treat as reply
      return {
        success: true,
        mode: "chat",
        session_id: "unknown",
        turn_id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        reply_to_user: content.replace(/```/g, ""),
        confidence: "high",
        extracted: { tone: "developer", idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null },
        status: { complete: false, missing: [], next_question: null },
        suggestions: [],
        error: { code: null, message: null },
        meta: { conversation_stage: "planning", turn_count: 0 },
        block: null
      };
    }
  }
  return data; // fallback
}

/** GET ping (no preflight) */
export async function pingCpChat() {
  const endpoint = getCpChatUrl();
  const resp = await fetch(endpoint, { method: "GET" });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, data };
}

/** POST invoke with header hints + fallback */
async function fetchFallback(body: any) {
  const { url, anon } = getSupabaseEnv();
  const endpoint = `${url}/functions/v1/cp-chat`;
  const resp = await fetch(endpoint, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anon}`, "apikey": anon, "x-cp-client": "vite-fallback" },
    body: JSON.stringify(body ?? {})
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, data };
}

export async function callCpChat(body: any) {
  const { anon } = getSupabaseEnv();
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.functions.invoke("cp-chat", {
      body: body ?? {},
      headers: { "Authorization": `Bearer ${anon}`, "apikey": anon }
    });
    if (error) {
      const fb = await fetchFallback(body);
      if (!fb.ok) return { ok: false, status: fb.status, statusText: fb.statusText, data: { error, fallback: fb.data } };
      return { ok: true, status: 200, statusText: "OK(fallback)", data: normalizeEnvelopeFromAny(fb.data) };
    }
    return { ok: true, status: 200, statusText: "OK", data: normalizeEnvelopeFromAny(data) };
  } catch (e: any) {
    const fb = await fetchFallback(body);
    if (!fb.ok) return { ok: false, status: fb.status, statusText: fb.statusText, data: { exception: e?.message, fallback: fb.data } };
    return { ok: true, status: 200, statusText: "OK(fallback)", data: normalizeEnvelopeFromAny(fb.data) };
  }
}