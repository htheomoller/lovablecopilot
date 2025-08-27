# M3 — Deterministic Orchestrator (m3.21)

**What changed**
- Server now decides status.next_question via computeNextQuestion() using an ordered REQUIRED list (tone → idea → audience → features → privacy → auth → deep_work_hours) and a persistent skip_map.
- Added schema coercion for extracted (defaults, enum normalization, array handling).
- skip_map is generalized and echoed in meta.skip_map; skip intents are detected from user text and optionally from model hint.skip.
- Last-write-wins merge between client memory and model output; multi-field extraction supported.
- Preserved automatic model switching and capability-aware temperature.
- Echo usage + $ cost when PRICE_TABLE is provided.

**Why**
- Eliminates LLM-led flow loops. The Edge Function is now the single source of truth for the conversation state and progression.

**Expected behavior**
- No repeated asks for already-known or skipped fields.
- If user says "skip name" (or similar) the flow advances and stays skipped.
- Compound answers (idea + audience + features) are accepted in one turn.
- Deterministic progression until status.complete=true.

**Deployment**
```
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

**Sanity tests**
1. "help with an app" → asks idea.
2. "to-do list for my family" → fills idea+audience, asks features.
3. "no name needed" at any time → never asks name again (skip stored in meta.skip_map).
4. Repeat idea → confirms internally and moves on.
5. Provide 2–3 features → asks privacy, then auth, then deep_work_hours → complete.