# M3 — Server Reply Control (m3.24)

**What changed**
- LLM is now extraction-only: Changed system prompt to only extract structured data, no conversational replies
- Server-generated replies: All reply_to_user content is now generated server-side using deterministic logic
- Natural acknowledgments: Server adds randomized acknowledgments ("Got it!", "Perfect!", etc.) when user provides info
- Robust clarification handling: Server provides explanations for all fields when user asks "explain", "what's the difference", etc.
- No UI duplication: Removed "Next Question" display since questions are now part of reply_to_user

**Why**
- Eliminates "split brain" problem where server flow control conflicted with LLM-generated conversational text
- Ensures deterministic, consistent conversation flow that matches the server's state machine
- Provides natural, contextual responses while maintaining full control over progression

**Expected behavior**
- Natural conversations with proper acknowledgments and explanations
- No more contradictory questions from LLM vs server logic
- Single, clean conversation flow without UI duplication
- Clarification requests are handled immediately with field-specific explanations

**Deploy**

```bash
supabase functions deploy cp-chat --no-verify-jwt --project-ref <YOUR_PROJECT_REF>
```

**Testing**
1. "help with an app" → asks idea naturally
2. "explain" after any question → provides field-specific explanation
3. "todo app for families" → acknowledges and moves to next field
4. Natural flow without contradictions or duplicated questions