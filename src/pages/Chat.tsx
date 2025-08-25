import React, { useEffect, useMemo, useRef, useState } from "react";
import QuickChips from "@/components/QuickChips";
import { Intake, Tone, FEATURE_LIBRARY, nextMissingField, summarizeIntake } from "@/lib/intakeTypes";
import { callEdge } from "@/lib/ai"; // existing helper

type Msg = { role: "assistant" | "user" | "system"; text: string; ts: number };

const START_GREETING =
  "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.";

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [intake, setIntake] = useState<Intake>(() => {
    try { return JSON.parse(localStorage.getItem("cp_intake_v1") || "{}"); } catch { return {}; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const missing = useMemo(() => nextMissingField(intake), [intake]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: "assistant", text: START_GREETING, ts: Date.now() }]);
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("cp_intake_v1", JSON.stringify(intake)); } catch {}
  }, [intake]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function sendText(say: string) {
    const trimmed = say.trim();
    if (!trimmed) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: trimmed, ts: Date.now() }]);

    // Light client-side routing to fill intake
    const lower = trimmed.toLowerCase();

    // Tone
    if (!intake.tone && ["explain like i'm 5", "eli5", "simple"].some(k => lower.includes(k))) {
      updateIntake({ tone: "Explain like I'm 5" }); return;
    }
    if (!intake.tone && lower.includes("intermediate")) { updateIntake({ tone: "Intermediate" }); return; }
    if (!intake.tone && lower.includes("developer")) { updateIntake({ tone: "Developer" }); return; }

    // Name helper
    if (!intake.name && /^name[:\s]/i.test(trimmed)) {
      const proposed = trimmed.replace(/^name[:\s]*/i, "").trim();
      if (proposed) { updateIntake({ name: proposed }); return; }
    }

    // Feature list (comma separated)
    if (!intake.features?.length && trimmed.includes(",")) {
      const feats = trimmed.split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);
      if (feats.length) { updateIntake({ features: feats }); return; }
    }

    // Otherwise, ask edge to chat back (still baseline echo or your current AI)
    try {
      setBusy(true);
      const data = await callEdge(trimmed, "chat");
      const reply = data.success ? (data.reply ?? "…") : `Error: ${data.error}`;
      setMessages(m => [...m, { role: "assistant", text: reply, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(m => [...m, { role: "assistant", text: `Error talking to AI: ${err?.message || err}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  function updateIntake(patch: Partial<Intake>) {
    setIntake(prev => {
      const next = { ...prev, ...patch };
      const need = nextMissingField(next);

      const followUps: string[] = [];
      if (patch.tone) followUps.push(`Got it — I'll keep it ${patch.tone === "Explain like I'm 5" ? "very simple" : patch.tone.toLowerCase()}.`);
      if (patch.idea) followUps.push(`Noted your idea.`);
      if (patch.name) followUps.push(`Great — I'll use "${patch.name}" as a working name (easy to change later).`);
      if (patch.audience) followUps.push(`Nice — audience captured.`);
      if (patch.features) followUps.push(`Features captured: ${patch.features.join(", ")}.`);

      // Ask next missing field or move to review
      if (need === "idea") followUps.push("What's your app idea in one short line?");
      if (need === "name") followUps.push("Do you have a name? If not, say “invent one” or type one.");
      if (need === "audience") followUps.push("Who is it for? (your ideal user/customer)");
      if (need === "features") followUps.push("Pick 2–5 must‑have features below or type a comma‑separated list.");

      if (!need) {
        followUps.push("Nice — I have what I need. Here's a quick summary. If everything looks right, hit “Confirm summary”, or say what to change.");
      }

      setMessages(m => [...m, { role: "assistant", text: followUps.join(" "), ts: Date.now() }]);
      return next;
    });
  }

  function pickTone(t: Tone) { if (!intake.tone) updateIntake({ tone: t }); }
  function toggleFeature(f: string) {
    setIntake(prev => {
      const set = new Set(prev.features || []);
      set.has(f) ? set.delete(f) : set.add(f);
      return { ...prev, features: Array.from(set).slice(0, 8) };
    });
  }

  function confirmSummary() {
    setMessages(m => [...m, { role: "assistant", text: "Awesome — summary confirmed. Next up: I can draft a roadmap. Want me to generate it now, or edit the summary first?", ts: Date.now() }]);
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-4">
        <button className="px-3 py-1 border rounded" onClick={() => window.location.reload()}>Refresh</button>
      </div>

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block px-3 py-2 rounded ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {m.text}
            </div>
          </div>
        ))}

        {/* Tone chips when tone is missing */}
        {!intake.tone && (
          <div>
            <div className="text-sm text-muted-foreground mt-1">Choose a style:</div>
            <QuickChips
              options={["Explain like I'm 5", "Intermediate", "Developer"]}
              onPick={(v) => pickTone(v as Tone)}
            />
          </div>
        )}

        {/* Features chips when features are missing */}
        {intake.tone && intake.idea && intake.name && intake.audience && (!intake.features || intake.features.length < 2) && (
          <div>
            <div className="text-sm text-muted-foreground">Quick picks (toggle):</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {FEATURE_LIBRARY.map((f) => {
                const on = (intake.features || []).includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFeature(f)}
                    className={`px-3 py-1 rounded-full border text-sm ${on ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary & confirm */}
        {nextMissingField(intake) === null && (
          <div className="mt-3">
            <div className="text-sm font-medium mb-1">Summary</div>
            <pre className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">{summarizeIntake(intake)}</pre>
            <div className="flex gap-2 mt-2">
              <button className="px-3 py-1 border rounded" onClick={confirmSummary}>Confirm summary</button>
              <button className="px-3 py-1 border rounded" onClick={() => setIntake({})}>Start over</button>
            </div>
          </div>
        )}

        {busy && <div className="text-sm text-muted-foreground">…thinking</div>}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => (e.key === "Enter" ? sendText(input) : undefined)}
          placeholder={missing === "idea" ? "One‑line idea…" : "Type your message…"}
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-3 py-2 border rounded" onClick={() => sendText(input)}>Send</button>
      </div>
    </div>
  );
}
