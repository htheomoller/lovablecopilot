// src/components/AuthGate.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEV_ROUTES, isDevOrPreview } from '@/config/public';

/**
 * Deterministic gate that is a NO-OP in DEV/PREVIEW (including editor iframe),
 * but blocks dev routes in PROD.
 *
 * We intentionally avoid importing AuthContext here to remove races while previewing.
 * You can reintroduce stricter auth checks later for PROD pages.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname;
  const devOrPreview = isDevOrPreview();
  const isDevRoute = (DEV_ROUTES as readonly string[]).some(
    r => path === r || path.startsWith(r + '/')
  );

  // In dev/preview (including Lovable editor), allow everything
  if (devOrPreview) {
    return <>{children}</>;
  }

  // PROD: block dev tools
  if (isDevRoute) {
    navigate('/', { replace: true });
    return null;
  }

  // Otherwise allow
  return <>{children}</>;
};