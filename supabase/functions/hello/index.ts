import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS,GET"
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

  console.log(`Hello function called with method: ${req.method}`);
  
  return json({ 
    success: true, 
    message: "Hello from Supabase!", 
    timestamp: new Date().toISOString(),
    method: req.method
  });
});