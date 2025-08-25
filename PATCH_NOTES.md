# Chat UX Hardening (no duplicate questions + quick‑reply chips)
	•	Added src/lib/aiClient.ts to call the edge extractor and parse responses safely.
	•	Refactored src/pages/Chat.tsx to:
	•	Render quick‑reply chips from the model's suggestions (plus first‑turn tone chips).
	•	Track a pendingQuestion and never ask it twice (prevents repeats).
	•	Show only the model's reply_to_user (no extra local prompts).
	•	Lock tone as soon as the model sets it once.
	•	Use functional state updates so no messages disappear.
	•	Kept Ping/Reset buttons for quick diagnostics.

Note: This assumes the edge function returns the JSON envelope we standardized:
{ reply_to_user, extracted, status: { complete, missing, next_question }, suggestions }.
If the envelope is missing, the chat still works but chips won't render.