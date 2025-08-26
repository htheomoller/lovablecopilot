# M3 — Flatten structured message.content (arrays/objects) → plain text

## Problem
Some OpenAI responses use structured content (arrays of parts or {type, text} objects). Those slipped through as {"text":"…"}.

## Fix
`flattenMessageContent()` now:
- Joins arrays of parts using each part's .text or .content.
- Reads object content via .text or .content.
- Falls back to string message.content when present.

We still normalize any JSON-shaped text the model returns (envelopes, {response:…}, {text:…}) and guarantee reply_to_user is a string.

## Deploy
```
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

## Verify
- Network → Response headers show `X-CP-Version: m3.12-content-array`.
- Ask "help me build a to-do app" → the bubble shows a clean sentence/code snippet, not a JSON object.