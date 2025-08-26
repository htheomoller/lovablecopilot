# M3 — Fix "Failed to fetch" by using supabase.functions.invoke
- Replaced manual fetch with @supabase/supabase-js functions.invoke('cp-chat'), which handles CORS and headers for Edge Functions.
- Kept your diagnostics panel; now it shows invoke errors/status consistently.
- Added @supabase/supabase-js to dependencies and tightened .env.example.

## Smoke test
1. Set env vars in Lovable (Vite): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
2. Reload the app (so Vite picks envs).
3. Click Ping cp-chat → expect Status: 200 OK and a JSON envelope (or a clear OPENAI_API_ERROR if the upstream blocks).
4. Send a normal chat message — you should see reply_to_user render; copy button appears when block.content exists.

If Ping still fails, copy the diagnostics box here — we'll read the exact error from supabase-js and adjust quickly.