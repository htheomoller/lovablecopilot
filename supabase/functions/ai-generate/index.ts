/**
 * Minimal, robust edge function with CORS and modes: ping | chat.
 * Keep simple until routing is proven stable.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: Record<string,string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type":"application/json" } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode = "chat", prompt = "" } = await req.json();

    if (mode === "ping") {
      return json({ success:true, mode:'ping', reply:'pong' });
    }

    // baseline echo until we wire OpenAI again
    return json({ success:true, mode:'chat', reply: `Baseline echo: "${String(prompt)}"` });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success:false, error: msg }, 500);
  }
});