# M3 — Session Memory (Client-provided) + Duplicate-Question Guard

**Why**: The model had no memory; we only sent the current turn. It kept re-asking for fields.

## What changed
- **Client**: builds a compact `memory.extracted` object by reducing previous assistant envelopes; sends it with every POST.
- **Edge**: includes memory in the model's user message; merges memory + model.extracted; recomputes status.missing; if the model asks for an already-known field, we replace `next_question` with the first missing field and append a gentle nudge.

## Result
- "I already told you the idea" → CP acknowledges and moves on to the next missing field (e.g., audience or features).
- Keeps one-question-per-turn, strict JSON envelope, Lovable-first behavior.

## Version
- X-CP-Version: m3.18-memory-guard

## No DB required  
- Memory is per-session and lives in the browser; explicit and transparent (as your PRD prefers).