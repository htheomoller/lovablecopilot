import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) }
  });
}

serve(async (req: Request) => {
  // CORS preflight FIRST
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Always try to read text first, so we can return JSON even if the client sent no/invalid JSON
  let raw = "";
  try { raw = await req.text(); } catch { /* ignore */ }

  // Safely parse JSON body, tolerate empty / invalid
  let body: any = {};
  if (raw && raw.trim().length) {
    try { body = JSON.parse(raw); } catch (e) { return json({ success: false, error: "Invalid JSON body", detail: String(e) }, { status: 400 }); }
  }

  // Modes
  const mode = String(body?.mode || "chat");
  const prompt = String(body?.prompt || "");

  // Simple health check that NEVER needs a body
  if (mode === "ping") {
    return json({ success: true, mode: "ping", reply: "pong" });
  }

  // Baseline echo to prove round‑trip works even without OpenAI
  if (!prompt) {
    return json({ success: true, mode, reply: "Baseline: no prompt provided (but function is reachable)." });
  }

  // If you already set OPENAI_API_KEY in Supabase, you can uncomment the OpenAI section later.  
  // For now, just echo so the chat can progress and we can isolate wiring issues.
  return json({ success: true, mode, reply: `Echo: "${prompt}"` });
});