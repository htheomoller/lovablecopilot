import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { GitBranch, Calendar, Lock, Sparkles, Shield, Play, CheckCircle, AlertTriangle, XCircle, Loader2, ExternalLink, Clock } from 'lucide-react';
import { GitHubAPI, GitHubRepository } from '@/lib/github';
import { AuditResults } from './AuditResults';

interface RepositoryCardProps {
  repository: GitHubRepository;
  isConnected: boolean;
  isLovableProject: boolean;
  onConnectionChange: (repoName: string, connected: boolean) => void;
  githubToken?: string;
}

export const RepositoryCard = ({ 
  repository, 
  isConnected, 
  isLovableProject, 
  onConnectionChange,
  githubToken
}: RepositoryCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [auditResults, setAuditResults] = useState<any>(null);
  const [showAuditResults, setShowAuditResults] = useState(false);

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

  const handleRunAudit = async () => {
    if (!githubToken || !isLovableProject) {
      toast({
        title: "Cannot Run Audit",
        description: isLovableProject ? "GitHub access token not available" : "Repository is not a Lovable project",
        variant: "destructive",
      });
      return;
    }

    try {
      setAuditStatus('running');
      const github = new GitHubAPI(githubToken);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { error } = await github.runRepositoryAudit(repository.html_url, user.id);
      
      if (error) {
        throw new Error(error);
      }

      // Fetch the audit results
      const { data: auditData, error: fetchError } = await supabase
        .from('repository_audits')
        .select('*')
        .eq('repository_name', repository.full_name)
        .eq('user_id', user.id)
        .order('last_audit_date', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) {
        throw new Error('Failed to fetch audit results');
      }

      setAuditResults(auditData?.audit_results);
      setAuditStatus('completed');
      setShowAuditResults(true);

      const auditReport = auditData?.audit_results as any;
      toast({
        title: "Audit Completed",
        description: `Repository audit completed with score: ${auditReport?.overall_score || 'N/A'}`,
      });

    } catch (error: any) {
      console.error('Error running audit:', error);
      setAuditStatus('error');
      toast({
        title: "Audit Failed",
        description: error.message || "Failed to run repository audit",
        variant: "destructive",
      });
    }
  };

  const getAuditStatusIcon = () => {
    switch (auditStatus) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Shield className="w-4 h-4" />;
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
    <div>
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
          
          <div className="flex gap-2">
            {isConnected && isLovableProject && (
              <Button
                onClick={handleRunAudit}
                disabled={auditStatus === 'running'}
                variant="secondary"
                size="sm"
              >
                {getAuditStatusIcon()}
                <span className="ml-2">
                  {auditStatus === 'running' ? 'Auditing...' : 'Run Audit'}
                </span>
              </Button>
            )}
            
            {auditStatus === 'completed' && auditResults && (
              <Button
                onClick={() => setShowAuditResults(true)}
                variant="outline"
                size="sm"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                View Results
              </Button>
            )}

            <Button
              onClick={handleToggleConnection}
              disabled={isLoading}
              variant={isConnected ? "outline" : "default"}
              size="sm"
            >
              {isLoading ? "Processing..." : (isConnected ? "Disconnect" : "Connect")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Dialog open={showAuditResults} onOpenChange={setShowAuditResults}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit Results - {repository.name}</DialogTitle>
        </DialogHeader>
        {auditResults && (
          <AuditResults 
            auditReport={auditResults}
            onClose={() => setShowAuditResults(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  </div>
  );
};