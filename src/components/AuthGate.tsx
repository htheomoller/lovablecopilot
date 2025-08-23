// src/components/AuthGate.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// NOTE: adjust import if your project uses '@/contexts/AuthContext' instead of '@/context/AuthContext'
import { useAuth } from '@/contexts/AuthContext';
import { DEV_ROUTES, isDevOrPreview } from '@/config/public';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Avoid race: don't decide until auth state listener fires
  if (loading) return null;

  const path = location.pathname;
  const devOrPreview = isDevOrPreview();
  const isDevRoute = (DEV_ROUTES as readonly string[]).some(
    route => path === route || path.startsWith(route + '/')
  );

  // 1) DEV tools are allowed in DEV/PREVIEW; blocked in PROD
  if (isDevRoute) {
    if (devOrPreview) {
      console.info('[AuthGate] Allow DEV route in dev/preview:', path);
      return <>{children}</>;
    }
    console.info('[AuthGate] Block DEV route in prod:', path);
    navigate('/', { replace: true });
    return null;
  }

  // 2) Optional site lockdown example (set via config/env)
  const SITE_LOCKDOWN = false;
  if (SITE_LOCKDOWN && !user) {
    console.info('[AuthGate] Lockdown redirect to /auth from:', path);
    navigate('/auth', { replace: true });
    return null;
  }

  return <>{children}</>;
};