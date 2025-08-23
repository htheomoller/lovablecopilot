// src/config/public.ts
export const DEV_ROUTES = ['/health', '/self-test', '/dev/breadcrumbs'] as const;

function isFramed(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

export function getEnv() {
  const dev = !!import.meta.env.DEV;
  const host = typeof window !== 'undefined' ? window.location.host : '';

  // Lovable preview/editor hosts we should treat as non-prod
  const isLovablePreviewHost =
    /(^preview--.*\.lovable\.app$)/.test(host) ||
    /(^id-preview--.*\.lovable\.app$)/.test(host) ||
    /(^[a-f0-9-]+\.lovableproject\.com$)/.test(host) ||
    host.includes('localhost');

  // If we're framed (e.g., inside the Lovable editor), force preview mode
  const framed = typeof window !== 'undefined' && isFramed();

  const preview = !dev && (isLovablePreviewHost || framed);
  const prod = !dev && !preview;

  return { dev, preview, prod, host, framed } as const;
}

export function isDevOrPreview() {
  const { dev, preview } = getEnv();
  return dev || preview;
}