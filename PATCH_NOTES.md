# M3 — System Prompt Hardened with Error Examples

**Change**
- Updated `SYS_PROMPT` to full M3 Prompt Engine instructions with all rules, examples, and added explicit `success=false` error cases (malformed input, unsupported request).

**Why**
- Prevents drift into generic Q&A.
- Ensures strict JSON-only envelopes.
- Teaches the model how to fail cleanly.

**Version**
- Edge Function now carries system prompt version `m3.17-m3-sysprompt`.

**Deploy**
```bash
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

**Test**
1. Ask a normal onboarding question → JSON envelope with `next_question`.
2. Send gibberish → envelope with `success=false`, `error.code=INVALID_INPUT`.
3. Ask for something out of scope → envelope with `success=false`, `error.code=UNSUPPORTED`.