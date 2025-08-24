export type AnswerStyle = 'eli5' | 'intermediate' | 'developer';
export interface Answers { idea?: string; name?: string; audience?: string; features?: string[]; privacy?: string; auth?: string; deep_work_hours?: string; }
export interface ChatMsg { role: 'user'|'assistant'|'system'; text: string; ts: number; }
export interface ChatSession { step: number; style: AnswerStyle; answers: Answers; messages: ChatMsg[]; completed: boolean; timestamp: number; }

const KEY = 'cp_chat_session_v2';
const ORDER: (keyof Answers)[] = ['idea','name','audience','features','privacy','auth','deep_work_hours'];

export const defaultSession = (): ChatSession => ({ step: 0, style: 'eli5', answers: {}, messages: [], completed: false, timestamp: Date.now() });
export const loadSession = (): ChatSession => { try { const j = localStorage.getItem(KEY); return j? JSON.parse(j) as ChatSession: defaultSession(); } catch { return defaultSession(); } };
export const saveSession = (s: ChatSession) => { try { localStorage.setItem(KEY, JSON.stringify({ ...s, timestamp: Date.now() })); } catch {}
};
export const clearSession = () => { try { localStorage.removeItem(KEY); } catch {} };

export function nextQuestion(a: Answers): string | '' {
  for (const k of ORDER) {
    const v: any = (a as any)[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) {
      switch (k) {
        case 'idea': return "What's your app idea in one short line?";
        case 'name': return "Do you have a name yet? If not, say 'invent one' or type a short name (e.g. PhotoFix).";
        case 'audience': return "Who is it for (your ideal user/customer)?";
        case 'features': return "List top 2–3 must‑have features (comma‑separated).";
        case 'privacy': return "Data visibility: Private, Share via link, or Public?";
        case 'auth': return "Sign‑in method: Google OAuth, Magic email link, or None (dev only)?";
        case 'deep_work_hours': return "Daily focused work hours: 0.5, 1, 2, or 4+?";
      }
    }
  }
  return '';
}

export const append = (s: ChatSession, m: ChatMsg): ChatSession => { const ns = { ...s, messages: [...s.messages, m] }; saveSession(ns); return ns; };