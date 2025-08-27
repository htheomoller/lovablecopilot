# M3 — Clarify + No-dup Reply (m3.23)

**What changed**
- Clarification-aware replies: if the user asks to "explain / what's the difference / why…", the server replies with a concise explanation for the previously asked field (privacy/auth/features/etc.), then proceeds deterministically.
- No duplicate questions in the bubble: reply_to_user no longer appends the next question text. The UI can keep showing status.next_question once, or you can hide that label for a more natural feel.

**Why**
- Users were confused when asking "what's the difference?" and getting pushed forward.
- Seeing the question twice (in the bubble and as "Next Question") felt robotic.

**Expected**
- Natural confirmations like "Great!" remain minimal, followed by a single, clear question (rendered by your UI from status.next_question).
- If the user requests an explanation, they get it right away—then the flow advances without looping.

**Tip (UI)**
- If you want a fully natural vibe, stop rendering the "Next Question" label and rely solely on reply_to_user. Otherwise, keep it as a small helper below the bubble—just not both.