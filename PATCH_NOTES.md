# Edge Function Hardening & Upstream Error Surfacing
	•	Rewrote supabase/functions/ai-generate/index.ts to:
	•	Always handle CORS preflight first.
	•	Add a ping mode that never calls OpenAI (isolates network/routing issues).
	•	Call OpenAI with clear error mapping:
	•	missing_openai_key if the secret is absent.
	•	upstream_error with status + raw body if OpenAI returns non‑200.
	•	upstream_invalid_json if the upstream body isn't valid JSON.
	•	extract_parse_error when model output doesn't contain a valid JSON object.
	•	Return consistent JSON with success and helpful fields.
	•	Updated src/lib/ai.ts to:
	•	Use VITE_SUPABASE_URL/functions/v1/ai-generate when available, else relative path.
	•	Surface non‑200 / non‑JSON responses with raw body in dev UI.
	•	Updated Chat to use the extractor mode by default (single call per turn), store answers, and display meaningful errors.
	•	If you see missing_openai_key, set the OPENAI_API_KEY in Supabase Edge Function secrets and redeploy.