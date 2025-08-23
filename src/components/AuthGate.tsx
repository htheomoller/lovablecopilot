// src/components/AuthGate.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// NOTE: adjust import if your project uses '@/contexts/AuthContext'
import { useAuth } from '@/contexts/AuthContext';
import { DEV_ROUTES, isDevOrPreview, getEnv } from '@/config/public';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) return null; // avoid race while auth initializes

  const path = location.pathname;
  const env = getEnv();
  const devOrPreview = isDevOrPreview();
  const isDevRoute = (DEV_ROUTES as readonly string[]).some(
    route => path === route || path.startsWith(route + '/')
  );

  // Debug breadcrumbs in console to diagnose any future issues
  // (Safe in DEV/PREVIEW; in PROD this runs but prints once per nav)
  // eslint-disable-next-line no-console
  console.info('[AuthGate]', { path, env, isDevRoute, userPresent: !!user });

  // 1) DEV tools allowed in DEV/PREVIEW; blocked in PROD
  if (isDevRoute) {
    if (devOrPreview) {
      return <>{children}</>;
    }
    navigate('/', { replace: true });
    return null;
  }

  // 2) Optional lockdown for non-dev routes (off by default here)
  const SITE_LOCKDOWN = false; // wire to env/config later if needed
  if (SITE_LOCKDOWN && !user) {
    navigate('/auth', { replace: true });
    return null;
  }

  return <>{children}</>;
};