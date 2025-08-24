export type AnswerStyle = 'eli5' | 'intermediate' | 'developer';

export interface ChatMsg { role: 'user' | 'assistant'; text: string; ts: number }
export interface ChatAnswers { idea?: string; name?: string; audience?: string; features?: string[]; privacy?: string; auth?: string; deep_work_hours?: string }
export interface ChatSession {
  step: number;
  answerStyle: AnswerStyle;
  answers: ChatAnswers;
  messages: ChatMsg[];
  completed: boolean;
  timestamp: number;
}

const KEY = 'cp_chat_session_v1';

export const defaultSession = (): ChatSession => ({
  step: 0,
  answerStyle: 'eli5',
  answers: {},
  messages: [],
  completed: false,
  timestamp: Date.now(),
});

export const loadSession = (): ChatSession => {
  try { const j = localStorage.getItem(KEY); return j ? JSON.parse(j) as ChatSession : defaultSession(); } catch { return defaultSession(); }
};
export const saveSession = (s: ChatSession) => { try { localStorage.setItem(KEY, JSON.stringify({ ...s, timestamp: Date.now() })); } catch {} };
export const clearSession = () => { try { localStorage.removeItem(KEY); } catch {} };

export const nextQuestion = (s: ChatSession): string | '' => {
  const a = s.answers;
  if (!a.idea) return 'Tell me your app idea in one short line (what it does).';
  if (!a.name) return "Do you have a name? If not, say 'invent one'.";
  if (!a.audience) return 'Who is it for (ideal user)?';
  if (!a.features || a.features.length === 0) return 'List top 2–3 must‑have features (comma separated).';
  if (!a.privacy) return 'Data visibility: Private, Share via link, or Public?';
  if (!a.auth) return 'Sign‑in: Google OAuth, Magic email link, or None (dev only)?';
  if (!a.deep_work_hours) return 'Daily focused work hours: 0.5, 1, 2, or 4+?';
  return '';
};

export const append = (s: ChatSession, m: ChatMsg): ChatSession => {
  const ns = { ...s, messages: [...s.messages, m] };
  saveSession(ns);
  return ns;
};