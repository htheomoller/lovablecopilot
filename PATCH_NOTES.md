# M3 — Make name optional + stable skip, and stop name loops

**Problem**
- CP repeatedly circled back to "What's the name?" after the user said they don't need one.
- Name was treated as required, so the guard kept steering back to "name" even when skipped.
- "No name needed" wasn't normalized into a definitive state.

## Fix
- Removed name from required fields (no longer in computeMissing).
- Server now treats common "no name needed" phrases as name="(skip)".
- New policy: don't ask for a name unless the user explicitly opts into naming or already provided one.
- Duplicate-ask guard enhanced to treat any name-related prompt as known/blocked when skipped.

## Result
- After "to-do list for my family," CP proceeds to audience/features and never asks about name again unless requested.
- "We won't worry about a name unless you ask" note appears when the model tries to go back to naming.
- Name loops are eliminated while maintaining full functionality.

## Version
- X-CP-Version: m3.20-required-fields-and-name-policy