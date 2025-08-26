# M3 — "Always return an Envelope" (server + client)

## Symptoms you saw
- Ping POST showed a raw OpenAI completion (with `choices[...]`) and the UI said "Please try again."

## What changed

### 1. Edge Function
- **Short-circuits "ping"** → returns a valid CP envelope (`reply_to_user: "pong"`) without contacting OpenAI.
- **After calling OpenAI**, we always extract `choices[0].message.content` and normalize it into our envelope.
- **Adds X-CP-Version: m3.7-normalizer** header so we can confirm deploy.

### 2. Client safety net  
- If the server ever returns a raw completion, the client now unwraps it and wraps it into a valid envelope before rendering.

## Deploy
```
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

Then hard refresh the app.

## Smoke tests
- **Click Ping cp-chat** → POST sample should now show: `{ reply_to_user: "pong", success: true, ... }` (not an OpenAI completion).
- **Send "help me build a todo app"** → you should see a natural reply (and Copy button when `block.content` exists).

If the header `X-CP-Version` does not appear in the Network tab, the Edge Function deploy didn't update—re-deploy and try again.