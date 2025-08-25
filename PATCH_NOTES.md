	•	Hardened LLM JSON handling:
	•	Edge function now requests strict JSON (response_format: json_object) and adds a coerceToValidJson() fixer (removes trailing commas, normalizes quotes).
	•	Client now uses aiChat() which gracefully falls back if parsing ever fails, so the chat never crashes.
	•	Updated system prompt to forbid bullets/trailing commas and to always emit the full envelope with all keys present.
	•	Chips always come from envelope.suggestions and align with status.next_question.
	•	State is merged incrementally and persisted in cp_answers_v2.