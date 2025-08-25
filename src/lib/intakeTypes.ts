export type Tone = "Explain like I'm 5" | "Intermediate" | "Developer";

export type Intake = {
  tone?: Tone;
  idea?: string;
  name?: string;
  audience?: string;
  features?: string[];
};

export const FEATURE_LIBRARY: string[] = [
  "Roadmap builder",
  "PRD writer", 
  "Milestones & timelines",
  "Code health checks",
  "Prompt helper",
  "Docs & snippets",
  "Best‑practice linting",
  "Error triage",
];

export const nextMissingField = (i: Intake): keyof Intake | null => {
  if (!i.tone) return "tone";
  if (!i.idea) return "idea";
  if (!i.name) return "name";
  if (!i.audience) return "audience";
  if (!i.features || i.features.length === 0) return "features";
  return null;
};

export const summarizeIntake = (i: Intake): string => {
  return [
    `Tone: ${i.tone ?? "—"}`,
    `Idea: ${i.idea ?? "—"}`,
    `Name: ${i.name ?? "—"}`,
    `Audience: ${i.audience ?? "—"}`,
    `Features: ${(i.features && i.features.length ? i.features.join(", ") : "—")}`,
  ].join("\n");
};