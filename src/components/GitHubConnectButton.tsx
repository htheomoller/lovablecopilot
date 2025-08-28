import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';
import { connectGitHubAccount } from '@/lib/github';
import { toast } from '@/hooks/use-toast';

interface GitHubConnectButtonProps {
  onConnect?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

export const GitHubConnectButton = ({ 
  onConnect, 
  variant = "outline",
  size = "default" 
}: GitHubConnectButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      const { error } = await connectGitHubAccount();
      
      if (error) {
        throw new Error(error);
      }
      
      onConnect?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to connect GitHub account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleConnect}
      disabled={isLoading}
      variant={variant}
      size={size}
      className="w-full"
    >
      <Github className="w-4 h-4 mr-2" />
      {isLoading ? 'Connecting...' : 'Connect GitHub'}
    </Button>
  );
};