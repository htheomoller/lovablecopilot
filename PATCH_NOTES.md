# Conversational Onboarding System

## M2: Moderated Chat Onboarding  
- Adds ai.ts (edge-call helper)
- Adds onboardingScript.ts (Q&A + milestone shaping)
- Updates Chat.tsx to run a state-machine onboarding: style -> scripted questions -> AI summary -> seed milestones -> breadcrumb.
- After onboarding, chat falls back to general Q&A using chosen style.

## Latest: Conversational Onboarding Patch
Applied conversational onboarding patch that transforms the chat into a natural language guided experience.

### Changes Made

#### Edge Function Updates (supabase/functions/ai-generate/index.ts)
- Added multi-mode support: 'chat', 'nlu', and 'roadmap'
- NLU mode normalizes user answers into clean structured data
- Roadmap mode synthesizes project plans from collected answers
- Enhanced system prompt for conversational guidance

#### New Chat Wizard (src/lib/chatWizard.ts)
- Lightweight session management with localStorage persistence
- Question flow logic that determines next required field
- Type definitions for conversational state management
- Auto-save functionality for chat sessions

#### Refactored Chat Page (src/pages/Chat.tsx)
- Natural conversation flow with one question at a time
- Style selection (ELI5/Intermediate/Developer) maintained throughout session
- NLU integration for answer normalization
- Roadmap generation trigger only when user explicitly requests it
- Clean, focused UI for conversational experience

### Features
- **Persistent Sessions**: Conversations survive page reloads
- **Natural Language Understanding**: User answers are normalized into clean data
- **Progressive Disclosure**: One question at a time for better UX
- **Smart Triggers**: Roadmap generation only on explicit user request
- **Style Awareness**: Technical explanation level maintained throughout

The chat now provides a natural, conversational onboarding experience while guaranteeing clean, structured data collection.