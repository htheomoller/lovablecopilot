import React from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: React.ReactNode;
}

const routeLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/connect-repo': 'Connect Repository',
  '/audit-results': 'Audit Results',
  '/chat': 'Chat',
  '/roadmap': 'Roadmap',
  '/health': 'Health Check',
  '/self-test': 'Health Check',
  '/settings': 'Settings',
};

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const currentLabel = routeLabels[currentPath] || 'Page';

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        
        <div className="flex-1">
          {/* Header with breadcrumbs */}
          <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 flex items-center gap-4">
            <SidebarTrigger className="-ml-1" />
            
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                {currentPath !== '/dashboard' && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          {/* Main content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}