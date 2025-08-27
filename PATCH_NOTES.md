# M3 — Envelope Merge + Memory Guard

**Problem**
- CP wasn't using the model's full JSON envelope, so filled fields weren't remembered.
- Model kept asking for idea or name again and again.

## Fix
- Added parseAsEnvelope to prefer model's JSON envelope when present.
- Merge client memory with model.extracted into a single merged state.
- Compute missing deterministically from merged state.
- Treat "no name" or "skip name" as valid (removes from missing).
- Enforce duplicate-question guard: if model asks for a known field, replace with the next missing field and append a gentle nudge.

## Result
- CP now truly "remembers" past answers in-session.
- Loops like "what's your idea?" after it was given are eliminated.
- Name skipping works gracefully.

## Version
- X-CP-Version: m3.19-envelope-merge