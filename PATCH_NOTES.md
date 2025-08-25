# M2 polish — strict JSON + chips rendering
	•	Edge function now:
	•	Calls OpenAI with response_format: json_object
	•	Parses & guards the JSON envelope against a local schema
	•	Sanitizes status.next_question to one sentence
	•	Returns { success:true, mode:"chat", envelope } — never free text
	•	Frontend:
	•	Renders envelope.suggestions[] as clickable chips above the composer
	•	Uses next_question as the input placeholder (prevents double-asking)
	•	Shows only reply_to_user in bubbles to avoid duplicate questions
	•	Persists the latest extracted snapshot to localStorage: cp_answers_v2

This closes the "clumsy chat / missing chips / repeated questions" issues and completes M2 integration readiness for M3 (Prompt Engine).