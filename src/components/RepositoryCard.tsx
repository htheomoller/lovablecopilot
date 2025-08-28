import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, GitBranch, Clock, CheckCircle, XCircle } from 'lucide-react';
import { GitHubRepository } from '@/lib/github';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface RepositoryCardProps {
  repository: GitHubRepository;
  isConnected: boolean;
  isLovableProject: boolean;
  onConnectionChange: (repoName: string, connected: boolean) => void;
}

export const RepositoryCard = ({ 
  repository, 
  isConnected, 
  isLovableProject,
  onConnectionChange 
}: RepositoryCardProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleToggleConnection = async () => {
    try {
      setIsLoading(true);
      
      if (isConnected) {
        // Disconnect repository
        const { data: profile } = await supabase
          .from('profiles')
          .select('connected_repositories')
          .eq('id', (await supabase.auth.getUser()).data.user?.id)
          .single();

        if (profile) {
          const updatedRepos = (profile.connected_repositories as any[] || [])
            .filter((repo: any) => repo.full_name !== repository.full_name);

          await supabase
            .from('profiles')
            .update({ connected_repositories: updatedRepos })
            .eq('id', (await supabase.auth.getUser()).data.user?.id);
        }

        onConnectionChange(repository.full_name, false);
        toast({
          title: "Repository disconnected",
          description: `${repository.name} has been disconnected`,
        });
      } else {
        // Connect repository
        const { data: profile } = await supabase
          .from('profiles')
          .select('connected_repositories')
          .eq('id', (await supabase.auth.getUser()).data.user?.id)
          .single();

        const currentRepos = (profile?.connected_repositories as any[] || []);
        const updatedRepos = [...currentRepos, {
          id: repository.id,
          name: repository.name,
          full_name: repository.full_name,
          description: repository.description,
          html_url: repository.html_url,
          is_lovable_project: isLovableProject,
          connected_at: new Date().toISOString()
        }];

        await supabase
          .from('profiles')
          .update({ connected_repositories: updatedRepos })
          .eq('id', (await supabase.auth.getUser()).data.user?.id);

        onConnectionChange(repository.full_name, true);
        toast({
          title: "Repository connected",
          description: `${repository.name} is now connected for auditing`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update repository connection",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {repository.name}
              {repository.private && (
                <Badge variant="secondary" className="text-xs">Private</Badge>
              )}
              {isLovableProject && (
                <Badge variant="default" className="text-xs bg-primary">Lovable</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm">
              {repository.description || 'No description provided'}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            asChild
          >
            <a
              href={repository.html_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            {repository.default_branch}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Updated {formatDate(repository.updated_at)}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-700 dark:text-green-400">Connected</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-muted-foreground">Not connected</span>
              </>
            )}
          </div>
          
          <Button
            onClick={handleToggleConnection}
            disabled={isLoading}
            variant={isConnected ? "destructive" : "default"}
            size="sm"
          >
            {isLoading ? 'Processing...' : (isConnected ? 'Disconnect' : 'Connect')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};