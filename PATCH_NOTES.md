# M3 — Fix "temperature unsupported" (auto-prune per model) + keep CORS/JSON rescue
- Added a capability map and only include temperature when the chosen model supports it.
- Default routing:
  - gpt-5 for code-heavy turns (no temperature param sent).
  - gpt-4.1-mini for brainstorm/chat (sends temperature).
- Preserves robust CORS (OPTIONS/GET/HEAD/POST) and strict JSON/rescue parsing.

## Deploy
```
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

## Notes
- You can override models via env:
  - CP_MODEL_DEFAULT (default: gpt-5)
  - CP_MODEL_MINI (default: gpt-4.1-mini)
- If OpenAI changes capabilities, update MODEL_CAPS.