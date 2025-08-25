# Chat Rollback Plan - COMPLETE

Goal: revert chat to the last good behavior and fix 3 defects (duplicates, chips off-topic, memory not sticking).

## Summary:
1. ✅ Single source of truth: keep src/pages/Chat.tsx. Delete src/pages/chat/Chat.tsx and any imports referencing it.
2. ✅ Edge contract: top-level JSON (no envelope). Types live in src/lib/copilot/types.ts.
3. ✅ Single-question rule: only render ONE assistant question per AI turn; dedupe by reply + next_question + requestId.
4. ✅ Chips: always render env.suggestions directly under the assistant's last message; clicking a chip sends that exact text and disables input while awaiting the reply.
5. ✅ Memory: reflect env.extracted back into Answers; never ask for a filled field; if user edits, acknowledge and update.

## Implementation:
- Created proper TypeScript types in `src/lib/copilot/types.ts`
- Updated Chat.tsx with deduplication logic and memory persistence
- Modified edge function to return top-level JSON format
- Added snapshot parameter for memory between requests
- Chips now render only under the last assistant message

## Test checklist (manual): 
- [ ] ping works
- [ ] send "Explain like I'm 5" → tone set
- [ ] say idea → idea set
- [ ] ask for name → set
- [ ] chips show relevant quick options
- [ ] no duplicate questions