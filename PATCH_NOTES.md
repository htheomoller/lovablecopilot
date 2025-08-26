# M3 — Stop [object Object] at the source

## What was happening
The model occasionally returned `reply_to_user` as an object; the frontend rendered it directly → `[object Object]`.

## Fix
Introduce `toText()` and use it in:
- `safeEnvelope()` (covers existing-envelope paths)
- `normalizeFromModel()` (covers wrapped JSON or plain text)  
- Final guard before returning the envelope

This guarantees `reply_to_user` is always a printable string (short JSON inline; long objects pretty-printed).

## Deploy
```
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

## Quick test
- **Ping** → assistant shows "pong" (already good).
- **Ask "help me build a todo app"** → bubble shows a real sentence, not `[object Object]`.
- **Network tab** should show `X-CP-Version: m3.10-reply-string`.