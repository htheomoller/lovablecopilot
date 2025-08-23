import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEV_ROUTES } from '@/config/public';

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
  const isDevRoute = DEV_ROUTES.some(route => location.pathname.startsWith(route));
  
  useEffect(() => {
    // Block DEV routes in production
    if (!isDev && isDevRoute) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, isDev, isDevRoute, navigate]);
  
  // Don't render dev routes in production
  if (!isDev && isDevRoute) {
    return null;
  }
  
  return <>{children}</>;
};