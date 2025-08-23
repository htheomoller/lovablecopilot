import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { logBreadcrumb } from '@/lib/devlog';
import { useEffect } from 'react';

const Chat = () => {
  const { user, loading } = useAuth();
  
  useEffect(() => {
    if (user) {
      logBreadcrumb({
        scope: 'navigation',
        summary: 'User visited Chat page',
        tags: ['navigation', 'chat']
      });
    }
  }, [user]);
  
  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to access the chat interface</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Chat Interface</h1>
        <p className="text-muted-foreground">AI-powered conversation and assistance</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            The chat interface is under development. This will provide AI-powered assistance
            for your CoPilot project development.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 border-2 border-dashed border-muted-foreground/25 rounded-lg flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="text-4xl text-muted-foreground/50">💬</div>
              <p className="text-muted-foreground">Chat interface placeholder</p>
              <p className="text-xs text-muted-foreground/75">
                Future implementation: conversation history, AI responses, project context
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Chat;