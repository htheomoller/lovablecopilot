import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS (tighten origin in prod)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// --- Tiny deterministic NLU (no LLM): map free-text -> {field,value} ---
function nluExtract(raw: string): { field: string|null; value: any; reply: string } {
  const prompt = (raw || "").trim();
  const lower = prompt.toLowerCase();

  // Privacy
  if (/(^|\b)(private|privacy)(\b|$)/.test(lower)) return { field: "privacy", value: "Private", reply: `Got it: **privacy** → "Private".` };
  if (/share/.test(lower)) return { field: "privacy", value: "Share via link", reply: `Got it: **privacy** → "Share via link".` };
  if (/(^|\b)public(\b|$)/.test(lower)) return { field: "privacy", value: "Public", reply: `Got it: **privacy** → "Public".` };

  // Auth
  if (/google|oauth/.test(lower)) return { field: "auth", value: "Google OAuth", reply: `Got it: **auth** → "Google OAuth".` };
  if (/magic|email\s*link/.test(lower)) return { field: "auth", value: "Magic email link", reply: `Got it: **auth** → "Magic email link".` };
  if (/(^|\b)none(\b|$)|dev only/.test(lower)) return { field: "auth", value: "None (dev only)", reply: `Got it: **auth** → "None (dev only)".` };

  // Deep work hours
  if (/\b0\.?5\b/.test(lower)) return { field: "deep_work_hours", value: "0.5", reply: `Got it: **deep_work_hours** → "0.5".` };
  if (/\b1\b/.test(lower)) return { field: "deep_work_hours", value: "1", reply: `Got it: **deep_work_hours** → "1".` };
  if (/\b2\b/.test(lower)) return { field: "deep_work_hours", value: "2", reply: `Got it: **deep_work_hours** → "2".` };
  if (/\b4\+?\b/.test(lower)) return { field: "deep_work_hours", value: "4+", reply: `Got it: **deep_work_hours** → "4+".` };

  // Features (comma/semicolon/newline list, or mentions of "feature")
  if (/features?/.test(lower) || /[,;\n]/.test(prompt)) {
    const items = prompt.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 6);
    if (items.length) return { field: "features", value: items, reply: `Got it: **features** → "${items.join(", ")}".` };
  }

  // Name (explicit mention only)
  if (/\b(name|call it)\b/.test(lower)) {
    const val = prompt.replace(/^(name:?\s*)/i, "").trim();
    const clean = val || `Project-${Math.random().toString(36).slice(2,6)}`;
    return { field: "name", value: clean, reply: `Got it: **name** → "${clean}".` };
  }

  // Audience (keywords)
  if (/audience|users?|customers?|for\s+/.test(lower)) {
    return { field: "audience", value: prompt, reply: `Got it: **audience** → "${prompt}".` };
  }

  // Default → idea
  return { field: "idea", value: prompt, reply: `Got it: **idea** → "${prompt}".` };
}

// Simple roadmap synthesis (deterministic) — no DB writes here
function buildRoadmap(answers: Record<string, any>) {
  const name = answers.name || "Your App";
  const hours = String(answers.deep_work_hours || "2");
  const speed = hours === "4+" ? 0.8 : hours === "2" ? 1.0 : hours === "1" ? 1.5 : 2.0;
  const days = (n: number) => Math.max(1, Math.round(n * speed));

  const milestones = [
    { name: "Setup & Auth", duration_days: days(3), status: "planned", description: "Project scaffold, auth, health checks" },
    { name: "Core Features", duration_days: days(7), status: "planned", description: (answers.features?.join(", ") || "Key features") },
    { name: "Polish & QA", duration_days: days(3), status: "planned", description: "Accessibility, tests, docs" },
    { name: "Launch", duration_days: days(2), status: "planned", description: "Deploy, analytics, feedback loop" }
  ];

  const reply = `Great — here's a first pass roadmap for **${name}** based on what you've told me.\n\n` +
`1) Setup & Auth (${milestones[0].duration_days}d) — scaffold + ${answers.auth || 'choose sign-in'}\n` +
`2) Core Features (${milestones[1].duration_days}d) — ${answers.features?.join(', ') || 'core flows'}\n` +
`3) Polish & QA (${milestones[2].duration_days}d) — tests, perf, docs\n` +
`4) Launch (${milestones[3].duration_days}d) — deploy + feedback`;

  return { reply, milestones };
}

serve(async (req: Request) => {
  // Preflight must be first
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode = "chat", prompt = "", answers = {} } = await req.json();

    if (mode === "nlu") {
      const res = nluExtract(prompt);
      return new Response(JSON.stringify({ success: true, mode: "nlu", field: res.field, value: res.value, reply: res.reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "roadmap") {
      const out = buildRoadmap(answers || {});
      return new Response(JSON.stringify({ success: true, mode: "roadmap", reply: out.reply, milestones: out.milestones }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback chat echo (baseline)
    return new Response(JSON.stringify({ success: true, mode: "chat", reply: `Baseline echo: "${prompt}"` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});