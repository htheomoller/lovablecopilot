Fix edge 404s and fragmentation:
- Ensure function exists at supabase/functions/ai-generate/index.ts with CORS-first handler and JSON-only responses.
- Add [functions.ai-generate] verify_jwt = false in supabase/config.toml.
- Add src/lib/ai.ts robust caller that throws on HTML/404.
- Harden Chat.tsx and add "Ping Edge" button to verify end-to-end quickly.

If ping shows JSON in chat, the edge is healthy and ready for incremental upgrades (OpenAI, NLU, roadmap).