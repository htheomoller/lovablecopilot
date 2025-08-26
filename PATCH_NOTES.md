# M3 — Treat { "text": "…", "type": "text" } as the message

## What was happening
The model sometimes returns generic JSON shapes like `{ "text": "…", "type": "text" }` instead of our expected envelope format. The normalizer only looked for `reply_to_user`, `response`, `reply`, or `message` fields, so when it didn't find those, it passed the entire object back as text — causing chat bubbles to show JSON blobs.

## Fix
- Normalizer now recognizes the `text/type` shape many models emit and uses `text` as `reply_to_user`
- Keeps earlier guards: envelope passthrough, response/reply/message aliases, pretty-string fallback
- Version header: `X-CP-Version: m3.11-text-alias` to confirm deploy

## Test
1. Hard refresh `/chat`
2. Hit Ping → confirm version shows `m3.11-text-alias`
3. Ask "help me build a to-do app" → bubble should show the actual sentence/code, not a JSON blob

If you still see a JSON blob afterward, paste the latest Network → Response body and I'll extend the normalizer for that shape too (some models return arrays of parts; we can fold those into text).