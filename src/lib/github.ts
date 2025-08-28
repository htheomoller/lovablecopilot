import { supabase } from '@/integrations/supabase/client';

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  updated_at: string;
  default_branch: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export class GitHubAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch(endpoint: string, options?: RequestInit) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  async getUser(): Promise<GitHubUser> {
    return this.fetch('/user');
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    const repos = await this.fetch('/user/repos?sort=updated&per_page=100');
    return repos.filter((repo: GitHubRepository) => !repo.private || true); // Include all for now
  }

  async getRepositoryContents(owner: string, repo: string, path: string = ''): Promise<any> {
    return this.fetch(`/repos/${owner}/${repo}/contents/${path}`);
  }

  async getPackageJson(owner: string, repo: string): Promise<any> {
    try {
      const content = await this.fetch(`/repos/${owner}/${repo}/contents/package.json`);
      if (content.content) {
        const decoded = atob(content.content);
        return JSON.parse(decoded);
      }
      return null;
    } catch (error) {
      console.error('Error fetching package.json:', error);
      return null;
    }
  }

  async checkLovableProject(owner: string, repo: string): Promise<boolean> {
    try {
      // Check for typical Lovable project indicators
      const packageJson = await this.getPackageJson(owner, repo);
      if (!packageJson) return false;

      // Check for Lovable-specific dependencies
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const lovableIndicators = [
        '@supabase/supabase-js',
        'vite',
        'react',
        'tailwindcss',
        '@radix-ui'
      ];

      const hasIndicators = lovableIndicators.some(indicator => 
        Object.keys(dependencies).includes(indicator)
      );

      // Also check for src directory structure
      try {
        await this.fetch(`/repos/${owner}/${repo}/contents/src`);
        return hasIndicators;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Error checking if Lovable project:', error);
      return false;
    }
  }
}

export async function connectGitHubAccount(): Promise<{ error?: string }> {
  try {
    const redirectUrl = `${window.location.origin}/connect-repo`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectUrl,
        scopes: 'repo read:user'
      }
    });
    
    return { error: error?.message };
  } catch (error: any) {
    return { error: error.message || 'Failed to connect GitHub account' };
  }
}

export async function saveGitHubProfile(accessToken: string): Promise<{ error?: string }> {
  try {
    const github = new GitHubAPI(accessToken);
    const user = await github.getUser();
    
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.id) {
      return { error: 'No authenticated user found' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        github_access_token: accessToken,
        github_username: user.login,
        last_github_sync: new Date().toISOString()
      })
      .eq('id', authUser.id);

    return { error: error?.message };
  } catch (error: any) {
    return { error: error.message || 'Failed to save GitHub profile' };
  }
}

export async function disconnectGitHub(): Promise<{ error?: string }> {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.id) {
      return { error: 'No authenticated user found' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        github_access_token: null,
        github_username: null,
        connected_repositories: [],
        last_github_sync: null
      })
      .eq('id', authUser.id);

    return { error: error?.message };
  } catch (error: any) {
    return { error: error.message || 'Failed to disconnect GitHub' };
  }
}