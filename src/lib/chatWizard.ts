/* Why: Conversational onboarding with NLU and session persistence */
export type AnswerStyle = 'eli5' | 'intermediate' | 'developer';

export interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

export interface ChatSession {
  step: number;
  answerStyle: AnswerStyle;
  answers: Record<string, any>;
  messages: Message[];
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
  try {
    const j = localStorage.getItem(KEY);
    return j ? JSON.parse(j) : defaultSession();
  } catch {
    return defaultSession();
  }
};

export const saveSession = (s: ChatSession) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, timestamp: Date.now() }));
  } catch {}
};

export const clearSession = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {}
};

export const nextQuestion = (s: ChatSession): string => {
  const a = s.answers;
  if (!a.idea) return "Tell me your app idea in one short line (what it does).";
  if (!a.name) return "Do you have a name? If not, say 'invent one'.";
  if (!a.audience) return "Who is it for (ideal user)?";
  if (!a.features || a.features.length === 0) return "List top 2–3 must-have features (comma separated).";
  if (!a.privacy) return "Data visibility: Private, Share via link, or Public?";
  if (!a.auth) return "Sign-in: Google OAuth, Magic email link, or None (dev only)?";
  if (!a.deep_work_hours) return "Daily focused work hours: 0.5, 1, 2, or 4+?";
  return '';
};

export function generateMilestones(answers: Record<string, any>, userId: string) {
  const deepWorkMultiplier = {
    '0.5': 2.0,
    '1': 1.5,
    '2': 1.0,
    '4+': 0.8
  }[answers.deep_work_hours] || 1.0;

  const authComplexity = {
    'Google OAuth': 3,
    'Magic email link': 2,
    'None (dev only)': 1
  }[answers.auth] || 2;

  const privacyComplexity = {
    'Private': 1,
    'Share via link': 2,
    'Public': 3
  }[answers.privacy] || 2;

  const baseDate = new Date();
  const addDays = (days: number) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + Math.ceil(days * deepWorkMultiplier));
    return date.toISOString().split('T')[0];
  };

  let currentDay = 0;

  return [
    {
      id: `setup-${Date.now()}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Setup & Auth',
      status: 'planned',
      duration_days: Math.ceil((3 + authComplexity) * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay)
    },
    {
      id: `core-${Date.now() + 1}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Core Features',
      status: 'planned',
      duration_days: Math.ceil((5 + (answers.features?.length || 3) * 1.5) * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay += Math.ceil((3 + authComplexity) * deepWorkMultiplier))
    },
    {
      id: `polish-${Date.now() + 2}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Polish & Deploy',
      status: 'planned',
      duration_days: Math.ceil((2 + privacyComplexity) * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay += Math.ceil((5 + (answers.features?.length || 3) * 1.5) * deepWorkMultiplier))
    },
    {
      id: `health-${Date.now() + 3}`,
      project: answers.idea?.slice(0, 50) || 'My App',
      name: 'Health & Monitoring',
      status: 'planned',
      duration_days: Math.ceil(2 * deepWorkMultiplier),
      owner_id: userId,
      start_date: addDays(currentDay += Math.ceil((2 + privacyComplexity) * deepWorkMultiplier))
    }
  ];
}