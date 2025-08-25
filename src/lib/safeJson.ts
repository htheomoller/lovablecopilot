export function safeParse<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { return null; }
}