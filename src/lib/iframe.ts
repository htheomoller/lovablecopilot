// Utility functions for iframe detection and safe navigation
export const isFramed = (): boolean => {
  try { return window.self !== window.top; } catch { return true; }
};

/**
 * Try to navigate top-level; if blocked by iframe sandbox, open a new tab; else fallback to self.
 * Returns one of: 'top' | 'blank' | 'self'
 */
export function escapeTo(url: string): 'top' | 'blank' | 'self' {
  // 1) Try top-level navigation
  try {
    if (window.top && window.top !== window.self) {
      (window.top as Window).location.href = url;
      return 'top';
    }
  } catch {
    // blocked by cross-origin / sandbox; continue to fallback
  }

  // 2) Fallback: open new tab (most reliable in iframe contexts)
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) return 'blank';

  // 3) Last resort: navigate the current (framed) window
  window.location.href = url;
  return 'self';
}