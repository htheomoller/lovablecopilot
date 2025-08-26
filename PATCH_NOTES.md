# M3 — Invoke hardening + fallback
- Invoke path now sends both Authorization: Bearer <anon> and apikey: <anon> headers explicitly.
- Added manual fetch fallback (CORS-friendly) when functions.invoke reports a FunctionsFetchError.
- Diagnostics panel continues to show the final path result (invoke or fallback).

## Quick checks
- Ensure Vite envs are set and the app rebuilt: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
- Confirm the Edge Function URL resolves from your device (no VPN/DNS blockers).
- If you still see FunctionsFetchError, the fallback section in the diagnostics box will show the raw gateway response for us to debug next.