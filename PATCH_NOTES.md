# M3 — CORS fix for cp-chat (preflight support)
- Added OPTIONS handler and CORS headers (Access-Control-Allow-Origin, -Headers, -Methods) to every response.
- Kept the stronger JSON enforcement + rescue parser from the previous iteration.
- This resolves browser-side "Failed to fetch" caused by preflight 405s.

## Deploy
```
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

Then reload /chat and hit "Ping cp-chat". You should now see a 200 with a JSON envelope (or a surfaced model error if upstream fails).