# M3 — Robust CORS + GET ping + better diagnostics
- Edge Function now:
  - Reflects Access-Control-Request-Headers in Access-Control-Allow-Headers.
  - Handles OPTIONS, GET, HEAD, and POST in one file.
  - Provides a GET /functions/v1/cp-chat health response to avoid preflight during diagnostics.
- Client:
  - Added pingCpChat() (GET) then POST to show both results in the diagnostics box.
  - Hardened error handling for invoke + fallback.
- This should eliminate "Failed to fetch (status 0)" caused by strict preflight header mismatches.

## If you still see failures
- Try clicking "Ping cp-chat" and share the GET/POST pair shown in the diagnostics box.
- If GET succeeds but POST fails, it's definitely a preflight issue; we can then lock the allowed headers to the exact set your browser sends (the reflection already does this).
- If both fail, we'll take an alternative route (proxy via a small Cloudflare Worker or Supabase Realtime Relay) — say the word and I'll ship that fallback.