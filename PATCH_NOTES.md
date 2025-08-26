# M3 — Stronger JSON enforcement + rescue parser
- Doubled system reminder: model must return JSON only.
- Added rescue parser: tries to extract first {...} block if extra text is present.
- If parsing fails, the raw model output is surfaced in error.message for debugging.
- This helps avoid the generic "Please rephrase" and lets you see what OpenAI actually returned.

## Deploy
```bash
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

## Next
- If errors persist, we'll log raw completions in a Supabase table for inspection.
- Once stable, we'll re-enable automatic model routing and temperature switching on top of this stricter parser.