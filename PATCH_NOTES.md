# M3 — Reply Enforcer (m3.22)

**What & Why**
- Users saw the model casually ask about fields we'd already filled or skipped, even though the server-picked Next Question was correct. This created the impression of "no memory."
- The server now sanitizes reply_to_user:
  - Removes model-asked questions entirely.
  - Drops sentences that mention fields already known or skipped.
  - Appends exactly one deterministic next_question.

**Scope**
- No heuristics or inference added.
- Deterministic orchestrator from m3.21 remains the source of truth.

**Expected UX**
- The bubble never asks about a skipped/known field.
- The final line always matches the Next Question shown below it.
- If conversation is complete, no trailing question is appended.