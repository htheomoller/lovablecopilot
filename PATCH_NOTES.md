M2: Moderated Chat Onboarding
- Adds ai.ts (edge-call helper)
- Adds onboardingScript.ts (Q&A + milestone shaping)
- Updates Chat.tsx to run a state-machine onboarding: style -> scripted questions -> AI summary -> seed milestones -> breadcrumb.
- After onboarding, chat falls back to general Q&A using chosen style.