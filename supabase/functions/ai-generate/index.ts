import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

serve(async (req: Request) => {
  // 1) CORS preflight first
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2) Must be JSON
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return new Response(JSON.stringify({ success: false, error: "Expected JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const { mode = "chat", prompt = "" } = await req.json().catch(() => ({ mode: "chat", prompt: "" }));

    // Minimal, rock-solid behaviors for debugging:
    // - ping   → { reply: "pong" }
    // - chat   → echoes the prompt
    if (mode === "ping") {
      return new Response(JSON.stringify({ success: true, mode: "ping", reply: "pong" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const reply = mode === "chat" ? `Baseline echo: "${prompt}"` : `Unknown mode "${mode}"`;

    return new Response(JSON.stringify({ success: true, mode, reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});