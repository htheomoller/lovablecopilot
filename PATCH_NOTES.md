# Conversational Onboarding — LLM NLU (no heuristics)

- Replaced `ai-generate` edge function with OpenAI JSON-schema based modes:
  - **nlu** → returns `{ reply, kv{key,value,confidence}, next_prompt, done }` (no local heuristics)
  - **roadmap** → returns `{ reply, milestones[] }`
  - **chat** → simple echo fallback
- Updated `src/lib/ai.ts` with `nlu()` and `makeRoadmap()` helpers.
- Rewrote `src/pages/Chat.tsx` to:
  - Always call **nlu** on each user turn
  - Store normalized answers (answer_style, idea, name, audience, features, privacy, auth, deep_work_hours)
  - Reflect friendly replies from the model (more human) and ask the next question
  - Show a compact summary and ask to generate roadmap when all fields are present
  - Persist messages + answers in `localStorage`

## Env
- Make sure **OPENAI_API_KEY** is set in Lovable → Project Settings → Secrets.

## Notes
- No regex/keyword heuristics remain in the edge function. Interpretation + normalization is handled by the model with a strict JSON schema.