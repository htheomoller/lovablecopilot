import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { GitHubConnectButton } from '@/components/GitHubConnectButton';
import { RepositoryCard } from '@/components/RepositoryCard';
import { GitHubAPI, GitHubRepository, saveGitHubProfile, disconnectGitHub } from '@/lib/github';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/AppLayout';
import { Github, Search, RefreshCw, Unlink } from 'lucide-react';

const ConnectRepo = () => {
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepository[]>([]);
  const [connectedRepos, setConnectedRepos] = useState<string[]>([]);
  const [lovableProjects, setLovableProjects] = useState<Set<string>>(new Set());
  const [githubProfile, setGithubProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle GitHub OAuth completions via auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.provider_token && session.user) {
          console.log('GitHub OAuth detected, saving profile...');
          await handleGitHubOAuthComplete(session.provider_token);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Check for existing GitHub tokens on mount
  useEffect(() => {
    const checkExistingGitHubToken = async () => {
      if (!user?.id) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.provider_token) {
        // We have a GitHub token but need to check if it's saved to profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('github_access_token')
          .eq('id', user.id)
          .maybeSingle();
          
        if (!profile?.github_access_token) {
          // Token exists in session but not in profile, save it
          console.log('Found unsaved GitHub token, saving...');
          await handleGitHubOAuthComplete(session.provider_token);
        }
      }
    };

    if (user?.id) {
      checkExistingGitHubToken();
    }
  }, [user]);

  const handleGitHubOAuthComplete = async (providerToken: string) => {
    try {
      // Ensure we have a valid user before proceeding
      if (!user?.id) {
        console.warn('No user available for GitHub OAuth completion');
        return;
      }

      console.log('Saving GitHub profile with access token...');
      const { error } = await saveGitHubProfile(providerToken);
      
      if (error) {
        console.error('Error saving GitHub profile:', error);
        toast({
          title: "Error",
          description: `Failed to save GitHub profile: ${error}`,
          variant: "destructive",
        });
      } else {
        console.log('GitHub profile saved successfully, loading data...');
        toast({
          title: "Success",
          description: "GitHub account connected successfully!",
        });
        await loadGitHubData();
      }
    } catch (error: any) {
      console.error('GitHub OAuth completion error:', error);
      toast({
        title: "Connection Error", 
        description: error.message || "Failed to save GitHub connection",
        variant: "destructive",
      });
    }
  };

  // Load GitHub data when user is authenticated
  useEffect(() => {
    if (user && !authLoading) {
      loadGitHubData();
    }
  }, [user, authLoading]);

  // Load GitHub profile and repositories
  const loadGitHubData = async () => {
    try {
      setLoading(true);
      
      // Ensure we have a valid user before making database queries
      if (!user?.id) {
        console.warn('No user available for loading GitHub data');
        setLoading(false);
        return;
      }
      
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      // If no profile exists, create one (fallback for missing profiles)
      if (!profile) {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email || '',
            name: user.email || 'Unknown User'
          })
          .select()
          .single();
        
        if (createError) {
          console.error('Error creating profile:', createError);
          toast({
            title: "Profile Error",
            description: "Failed to create user profile. Please try refreshing the page.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        
        profile = newProfile;
      }

      if (!profile?.github_access_token) {
        setLoading(false);
        return;
      }

      setGithubProfile(profile);
      
      const github = new GitHubAPI(profile.github_access_token);
      const repos = await github.getRepositories();
      setRepositories(repos);
      setFilteredRepos(repos);

      // Get connected repositories
      const connected = (profile.connected_repositories as any[] || []).map(repo => repo.full_name);
      setConnectedRepos(connected);

      // Check which repos are Lovable projects
      const lovableChecks = await Promise.all(
        repos.map(async (repo) => {
          const [owner, name] = repo.full_name.split('/');
          const isLovable = await github.checkLovableProject(owner, name);
          return { fullName: repo.full_name, isLovable };
        })
      );

      const lovableSet = new Set(
        lovableChecks.filter(check => check.isLovable).map(check => check.fullName)
      );
      setLovableProjects(lovableSet);

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load GitHub data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await disconnectGitHub();
      if (error) {
        throw new Error(error);
      }
      
      setGithubProfile(null);
      setRepositories([]);
      setFilteredRepos([]);
      setConnectedRepos([]);
      setLovableProjects(new Set());
      
      toast({
        title: "Disconnected",
        description: "GitHub account has been disconnected",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect GitHub",
        variant: "destructive",
      });
    }
  };

  const handleConnectionChange = (repoName: string, connected: boolean) => {
    if (connected) {
      setConnectedRepos(prev => [...prev, repoName]);
    } else {
      setConnectedRepos(prev => prev.filter(name => name !== repoName));
    }
  };

  // Filter repositories based on search
  useEffect(() => {
    if (!searchQuery) {
      setFilteredRepos(repositories);
    } else {
      const filtered = repositories.filter(repo =>
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredRepos(filtered);
    }
  }, [searchQuery, repositories]);

  // Redirect if not authenticated
  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background p-4">
      <div className="container max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Repository Connections</h1>
            <p className="text-muted-foreground mt-1">
              Connect your GitHub repositories for automated auditing
            </p>
          </div>
          {githubProfile && (
            <Button onClick={handleDisconnect} variant="outline">
              <Unlink className="w-4 h-4 mr-2" />
              Disconnect GitHub
            </Button>
          )}
        </div>

        {!githubProfile ? (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <Github className="w-12 h-12 mx-auto mb-4" />
              <CardTitle>Connect Your GitHub Account</CardTitle>
              <CardDescription>
                Connect your GitHub account to access and audit your repositories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GitHubConnectButton onConnect={() => loadGitHubData()} />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* GitHub Profile Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Github className="w-5 h-5" />
                  Connected as @{githubProfile.github_username}
                </CardTitle>
                <CardDescription>
                  {connectedRepos.length} repositories connected for auditing
                  {githubProfile.last_github_sync && (
                    <span className="block mt-1">
                      Last synced: {new Date(githubProfile.last_github_sync).toLocaleString()}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => loadGitHubData()} 
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Repositories
                  </Button>
                  <Badge variant="secondary">
                    {repositories.length} repositories found
                  </Badge>
                  <Badge variant="default">
                    {lovableProjects.size} Lovable projects detected
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Search */}
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search repositories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Repository List */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRepos.map((repo) => (
                <RepositoryCard
                  key={repo.id}
                  repository={repo}
                  isConnected={connectedRepos.includes(repo.full_name)}
                  isLovableProject={lovableProjects.has(repo.full_name)}
                  onConnectionChange={handleConnectionChange}
                  githubToken={githubProfile?.github_access_token}
                />
              ))}
            </div>

            {filteredRepos.length === 0 && repositories.length > 0 && (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">
                    No repositories found matching "{searchQuery}"
                  </p>
                </CardContent>
              </Card>
            )}

            {repositories.length === 0 && (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">
                    No repositories found in your GitHub account
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ConnectRepo;