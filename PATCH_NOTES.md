### M2 Chat UX: Style label upgrade
- Replace visible "ELI5" with "Explain like I'm 5 (very simple)".
- Add robust style detection: understands natural phrases like "explain like I'm 5", "simple", "very simple", "not too technical", "developer/advanced".
- Reflections now use friendly label via styleDisplay().

Patch: Direct Edge Invoke + Visible Ping (stability first)
• Added src/lib/ai.ts with currentAiEndpoint, callEdge, pingEdge using direct Supabase Invoke URL and anon-key headers. This bypasses any editor proxy that was returning 404 HTML.
• Updated src/pages/Chat.tsx to show the exact endpoint in the UI, added a "Ping Edge" button that reports the raw result, and improved error surfacing for Non‑JSON responses.
• Kept supabase/functions/ai-generate/index.ts minimal (OPTIONS first, JSON always) with ping and chat modes so we can verify routing independently from LLM logic.
• Ensured supabase/config.toml lists ai-generate with verify_jwt=false so browser calls succeed.
• Once ping reliably returns { success:true, reply:'pong' } inside the app (not just cURL), we can layer back OpenAI and the richer onboarding flow.