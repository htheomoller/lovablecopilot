export type Tone = 'eli5'|'intermediate'|'developer'|null;

export interface Extracted {
  tone: Tone;
  idea: string|null;
  name: string|null;
  audience: string|null;
  features: string[];
  privacy: 'Private'|'Share via link'|'Public'|null;
  auth: 'Google OAuth'|'Magic email link'|'None (dev only)'|null;
  deep_work_hours: '0.5'|'1'|'2'|'4+'|null;
}

export interface Status {
  complete: boolean;
  missing: (keyof Extracted)[];
  next_question: string|null;
}

export interface Env {
  reply_to_user: string;
  extracted: Extracted;
  status: Status;
  suggestions: string[];
}

export interface EdgeOk {
  success: true;
  mode: 'chat'|'ping';
  reply_to_user?: string;
  extracted?: Extracted;
  status?: Status;
  suggestions?: string[];
}

export interface EdgeErr { 
  success: false; 
  error: string; 
  message?: string; 
  details?: unknown; 
}