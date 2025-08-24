import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

serve(async (req: Request) => {
  // CORS preflight first
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Be resilient to empty/unparsable JSON
    let body: any = {};
    try { body = await req.json(); } catch {}

    const mode = typeof body?.mode === "string" ? body.mode : "chat";
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";

    if (mode === "health") {
      return new Response(JSON.stringify({ ok: true, mode, ts: Date.now() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Baseline echo so we ALWAYS return JSON
    return new Response(JSON.stringify({
      success: true,
      mode,
      reply: `Baseline echo: "${prompt}"`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: String(err?.message || err)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});