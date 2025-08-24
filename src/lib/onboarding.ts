/**
 * Minimal slot-filling for onboarding.
 * We do NOT use heuristics. We let the LLM populate fields,
 * and we merge them into a session answers object.
 */
export type Answers = {
  idea?: string;
  name?: string;
  audience?: string;
  features?: string[];
  privacy?: "Private" | "Share via link" | "Public";
  auth?: "Google OAuth" | "Magic email link" | "None (dev only)";
  deep_work_hours?: "0.5" | "1" | "2" | "4+";
};

export const REQUIRED_ORDER: (keyof Answers)[] = [
  "idea",
  "name",
  "audience",
  "features",
  "privacy",
  "auth",
  "deep_work_hours",
];

export function nextMissing(a: Answers): keyof Answers | null {
  for (const k of REQUIRED_ORDER) {
    const v = (a as any)[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) return k;
  }
  return null;
}

export function reflectPromptFor(field: keyof Answers): string {
  switch (field) {
    case "idea": return "What's your app idea in one short line?";
    case "name": return "Do you already have a name? If not, I can suggest a temporary working name.";
    case "audience": return "Who is it for? (describe your ideal user/customer)";
    case "features": return "List 2–5 must‑have features (comma‑separated).";
    case "privacy": return "Data visibility: Private, Share via link, or Public?";
    case "auth": return "Sign‑in preference: Google OAuth, Magic email link, or None (dev only)?";
    case "deep_work_hours": return "Daily focused work hours you can commit: 0.5, 1, 2, or 4+?";
  }
}

export function mergeExtract(current: Answers, extracted: Partial<Answers>): Answers {
  const next: Answers = { ...current };
  for (const k of Object.keys(extracted) as (keyof Answers)[]) {
    const val = extracted[k];
    if (val == null) continue;
    if (k === "features" && Array.isArray(val)) {
      next.features = val.map((s) => String(s)).filter(Boolean).slice(0, 6);
    } else {
      (next as any)[k] = typeof val === "string" ? val.trim() : val;
    }
  }
  return next;
}