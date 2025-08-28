import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  GitBranch, 
  Shield, 
  Settings, 
  BarChart3,
  LogOut,
  Map,
  Heart
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

const navigationItems = [
  { title: 'Dashboard', url: '/dashboard', icon: Home },
  { title: 'Connect Repository', url: '/connect-repo', icon: GitBranch },
  { title: 'Audit Results', url: '/audit-results', icon: Shield },
  { title: 'Chat', url: '/chat', icon: BarChart3 },
];

const secondaryItems = [
  { title: 'Roadmap', url: '/roadmap', icon: Map },
  { title: 'Health Check', url: '/health', icon: Heart },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const { open, setOpen } = useSidebar();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Success",
        description: "Signed out successfully!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const isActive = (path: string) => location.pathname === path;
  const getNavClassName = (path: string) => 
    isActive(path) 
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
      : "hover:bg-sidebar-accent/50";

  return (
    <Sidebar className={open ? "w-64" : "w-16"} collapsible="icon">
      <SidebarHeader className="p-4">
        <NavLink to="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          {open && (
            <h1 className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
              CoPilot
            </h1>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavClassName(item.url)}>
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={getNavClassName(item.url)}>
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {user && (
          <div className="space-y-2">
            {open && (
              <div className="text-xs text-sidebar-foreground/60 truncate">
                {user.email}
              </div>
            )}
            <Button
              onClick={handleSignOut}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              {open && <span className="ml-2">Sign Out</span>}
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}