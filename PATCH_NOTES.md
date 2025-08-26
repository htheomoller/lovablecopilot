# M3 — Automatic temperature + model switching
- Updated cp-chat Edge Function to auto-detect intent (generate_code, brainstorm, chat).
- Routes to GPT-5 for code-heavy turns (no temperature - model default), GPT-4o-mini for brainstorm (temp 0.8) and casual chat (temp 0.3).
- Added proper capability map to avoid sending unsupported params (no temperature/top_p to GPT-5, proper max_completion_tokens usage).
- Fixed OpenAI API parameter compatibility issues.
- Still returns JSON envelope only, safe for Lovable.

## If you still get 404
1. **Confirm envs are loaded in Vite** (restart dev server/build):
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` present.
2. **Verify the function exists and is named exactly `cp-chat`:**
   - `supabase functions list --project-ref <ref>`
   - If missing: `supabase functions deploy cp-chat --no-verify-jwt --project-ref <ref>`
3. **Direct curl test** (copy/paste, replace vars):
   ```bash
   curl -i -X POST "$VITE_SUPABASE_URL/functions/v1/cp-chat" \
     -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
     -H "apikey: $VITE_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"user_input":"ping"}'
   ```
   - 200 + JSON → function reachable.
   - 404 → wrong project ref or function not deployed.

4. **Check project ref/domain** (no trailing slashes, correct region). Some 404s are from accidentally pointing to a local/emulator URL.
5. **Ensure you're using POST** (GET will 404).