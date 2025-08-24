Reset edge baseline to eliminate 404s and non-JSON responses.
- Created supabase/functions/ai-generate/index.ts that always returns JSON and handles CORS preflight first.
- Added src/lib/ai.ts with strict JSON parsing and helpful error messages.
- Updated Chat page to include a "Ping Edge" button that shows the raw JSON so we can verify the function is reachable.
Next step after verification: layer in OpenAI + conversational onboarding.