# M3 — Unwrap JSON-looking strings (final polish)

**Symptom:** Chat bubble still shows {"message":"…"} blobs.
**Root cause:** The model sometimes returns a JSON string containing {message|text|...}; earlier logic extracted objects/arrays but didn't always re-parse strings that look like JSON.
**Fix:** When the intermediate result is a JSON-looking string, we parse it and extract human text again using the universal extractor.

## Deploy
```
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

## Verify
- Network headers show `X-CP-Version: m3.14-unwrap-jsontext`.
- Ask "help me build a to-do app" → bubble shows clean natural text (no JSON wrapper).
- Ping still returns `{ reply_to_user: "pong", ... }`.