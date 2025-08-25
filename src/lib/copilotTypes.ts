export type Extracted = {
  tone: "eli5" | "intermediate" | "developer" | null;
  idea: string | null;
  name: string | null;
  audience: string | null;
  features: string[];
  privacy: "Private" | "Share via link" | "Public" | null;
  auth: "Google OAuth" | "Magic email link" | "None (dev only)" | null;
  deep_work_hours: "0.5" | "1" | "2" | "4+" | null;
};
export type Envelope = {
  reply_to_user: string;
  extracted: Extracted;
  status: { complete: boolean; missing: string[]; next_question: string };
  suggestions: string[];
};
export type EdgeReply =
  | { success: true; mode: "ping"; reply: string }
  | ({ success: true; mode: "chat" } & Envelope)
  | { success: false; error: string; message: string; details?: unknown };