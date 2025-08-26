# M3 — Vite client hardening for 404s
- Added `src/lib/cpClient.ts` to normalize the cp-chat endpoint and set required headers (Authorization and apikey with the anon key).
- Reworked `src/pages/Chat.tsx` to use the shared client, and added a "Ping cp-chat" diagnostic with live endpoint echo and response preview.
- Updated `.env.example` for VITE_ variables (Vite) and clarified that OPENAI_API_KEY lives in Supabase function secrets.

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