import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ success:true, message:"Hello from Supabase!", timestamp:new Date().toISOString(), method:req.method }),
    { headers: { ...cors, "Content-Type":"application/json" }});
});