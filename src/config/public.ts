// src/config/public.ts
export const DEV_ROUTES = ['/health', '/self-test', '/dev/breadcrumbs'] as const;

export function getEnv() {
  const dev = !!import.meta.env.DEV;
  const host = typeof window !== 'undefined' ? window.location.host : '';

  // Treat Lovable preview/editor as non-prod (DEV-like)
  const isLovablePreview =
    /(^preview--.*\.lovable\.app$)/.test(host) ||
    /(^id-preview--.*\.lovable\.app$)/.test(host) ||
    /(^[a-f0-9-]+\.lovableproject\.com$)/.test(host) ||
    host.includes('localhost');

  const preview = !dev && isLovablePreview;
  const prod = !dev && !preview;
  return { dev, preview, prod };
}

export function isDevOrPreview() {
  const { dev, preview } = getEnv();
  return dev || preview;
}