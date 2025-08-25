export type Extracted = {
  tone: 'eli5' | 'intermediate' | 'developer' | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: 'Private' | 'Share via link' | 'Public' | null;
  auth: 'Google OAuth' | 'Magic email link' | 'None (dev only)' | null;
  deep_work_hours: '0.5' | '1' | '2' | '4+' | null;
};

export type Envelope = {
  reply_to_user: string;
  extracted: Extracted;
  status: {
    complete: boolean;
    missing: string[];
    next_question: string;
  };
  suggestions: string[];
};

export type EdgeResponse =
  | { success: true; mode: 'chat'; reply_to_user: string; extracted: Extracted; status: Envelope['status']; suggestions: string[] }
  | { success: true; mode: 'ping'; reply: string }
  | { success: false; error: string; details?: unknown };

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; text: string; ts: number };

export function mergeExtracted(prev: Extracted, next: Extracted): Extracted {
  const merged: Extracted = { ...prev };
  (Object.keys(next) as Array<keyof Extracted>).forEach((key) => {
    const val = next[key];
    if (key === 'features') {
      const a = Array.isArray(prev.features) ? prev.features : [];
      const b = Array.isArray(next.features) ? next.features : [];
      merged.features = Array.from(new Set([...a, ...b].map((s) => `${s}`.trim()).filter(Boolean)));
      return;
    }
    if (val !== null && val !== undefined && `${val}`.trim() !== '') {
      // only accept concrete answers; never store placeholders like "i don't know"
      if (typeof val === 'string' && /^(tbd|i[\s']?m not sure|don'?t know|later)$/i.test(val.trim())) {
        return;
      }
      // @ts-expect-error indexed write
      merged[key] = val;
    }
  });
  return merged;
}

export const EMPTY_EXTRACTED: Extracted = {
  tone: null, idea: null, name: null, audience: null, features: [], privacy: null, auth: null, deep_work_hours: null
};