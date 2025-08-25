import { useEffect, useMemo, useRef, useState } from "react";
import { aiChat, type Envelope, type Extracted } from "@/lib/ai";

type Msg = { role: "user" | "assistant"; text: string; ts: number };

function loadAnswers(): Extracted {
  try { return JSON.parse(localStorage.getItem("cp_answers_v2") || ""); } catch { /* noop */ }
  return { tone: null, idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null };
}
function saveAnswers(a: Extracted) { try { localStorage.setItem("cp_answers_v2", JSON.stringify(a)); } catch {} }

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const answersRef = useRef(loadAnswers());
  const [chips, setChips] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      text: "Hi — let's get started building your idea! I'm wired to an edge function. You can test it with the Ping Edge button. How should I talk to you? Say: Explain like I'm 5 (very simple), Intermediate, or Developer.",
      ts: Date.now(),
    }]);
    setChips(["Explain like I'm 5", "Intermediate", "Developer"]);
  }, []);

  async function turn(userText: string) {
    const now = Date.now();
    setMessages(m => [...m, { role: "user", text: userText, ts: now }]);
    setBusy(true);
    try {
      const toneMap: Record<string, Extracted["tone"]> = {
        "explain like i'm 5": "eli5",
        "eli5": "eli5",
        "intermediate": "intermediate",
        "developer": "developer",
      };
      // If user picked a tone, prefer "extract" mode with prior state.
      const chosenTone = toneMap[userText.trim().toLowerCase()];
      const env: Envelope = await aiChat(userText, "extract", answersRef.current);

      // merge extracted into our local snapshot (respecting null/[] per schema)
      const merged: Extracted = { ...answersRef.current, ...env.extracted };
      // handle explicit tone choice
      if (chosenTone) merged.tone = chosenTone;

      answersRef.current = merged;
      saveAnswers(merged);

      setMessages(m => [...m, { role: "assistant", text: env.reply_to_user, ts: Date.now() }]);
      setChips(env.suggestions || []);
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", text: `Error talking to AI: ${e.message || e}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex gap-2">
        <button className="px-3 py-1 rounded border" onClick={() => window.location.reload()}>Refresh</button>
        <button
          className="px-3 py-1 rounded border"
          onClick={() => {
            localStorage.removeItem("cp_answers_v2");
            answersRef.current = {
              tone: null, idea: null, name: null, audience: null, features: [],
              privacy: null, auth: null, deep_work_hours: null
            };
            setMessages([{ role: "assistant", text: "Reset complete. How should I talk to you? Explain like I'm 5, Intermediate, or Developer?", ts: Date.now() }]);
            setChips(["Explain like I'm 5", "Intermediate", "Developer"]);
          }}
        >
          Reset
        </button>
      </div>

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "assistant" ? "bg-gray-50 p-2 rounded" : "text-right"}>
            <div className="whitespace-pre-wrap">{m.text}</div>
          </div>
        ))}
        {busy && <div className="text-sm text-gray-500">…thinking</div>}
      </div>

      {!!chips.length && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <button key={i} className="px-2 py-1 rounded-full border text-sm" onClick={() => turn(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => (e.key === "Enter" ? (turn(input.trim()), setInput("")) : null)}
          placeholder="Type your message…"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button className="px-3 py-2 border rounded" onClick={() => (turn(input.trim()), setInput(""))}>Send</button>
      </div>
    </div>
  );
}