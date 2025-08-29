import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface AuditCheck {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
  file_path?: string;
  line_number?: number;
}

interface AuditReport {
  repository_name: string;
  repository_url: string;
  scan_timestamp: string;
  overall_score: number;
  summary: {
    total_checks: number;
    passed: number;
    warnings: number;
    failed: number;
    sandbox_blocks: number;
    files_scanned: number;
  };
  checks: AuditCheck[];
  recommendations: string[];
}

class RepositoryAuditor {
  private githubToken: string;
  private owner: string;
  private repo: string;
  private checks: AuditCheck[] = [];
  private sandboxBlocks = 0;
  private filesScanned = 0;

  constructor(githubToken: string, owner: string, repo: string) {
    this.githubToken = githubToken;
    this.owner = owner;
    this.repo = repo;
  }

  private async fetchGitHubApi(endpoint: string) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  private async getFileContent(path: string): Promise<string | null> {
    try {
      const content = await this.fetchGitHubApi(`/repos/${this.owner}/${this.repo}/contents/${path}`);
      if (content.content) {
        return atob(content.content);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private async scanDirectory(path: string = ''): Promise<string[]> {
    try {
      const contents = await this.fetchGitHubApi(`/repos/${this.owner}/${this.repo}/contents/${path}`);
      const filePaths: string[] = [];

      for (const item of contents) {
        if (item.type === 'file' && (
          item.name.endsWith('.ts') || item.name.endsWith('.tsx') || 
          item.name.endsWith('.js') || item.name.endsWith('.jsx') ||
          item.name.endsWith('.json') || item.name.endsWith('.md')
        )) {
          filePaths.push(item.path);
        } else if (item.type === 'dir' && !item.name.startsWith('.') && item.name !== 'node_modules') {
          const subFiles = await this.scanDirectory(item.path);
          filePaths.push(...subFiles);
        }
      }

      return filePaths;
    } catch (error) {
      return [];
    }
  }

  private isLegitimateCode(line: string, filePath: string, lineIndex: number, lines: string[]): boolean {
    // Exclude documentation and example files
    if (filePath.includes('/docs/') || filePath.includes('/examples/') || 
        filePath.includes('/test/') || filePath.endsWith('.md') ||
        filePath.includes('README') || filePath.includes('CHANGELOG')) {
      return true;
    }

    // Skip import/export statements
    if (line.includes('import') || line.includes('export')) {
      return true;
    }

    // Check if inside JSDoc comment block
    let inJSDoc = false;
    for (let i = Math.max(0, lineIndex - 10); i <= lineIndex; i++) {
      if (lines[i]?.includes('/**')) inJSDoc = true;
      if (lines[i]?.includes('*/')) inJSDoc = false;
    }
    if (inJSDoc) return true;

    // Check if inside markdown code block
    let inCodeBlock = false;
    for (let i = Math.max(0, lineIndex - 20); i <= lineIndex; i++) {
      if (lines[i]?.includes('```')) inCodeBlock = !inCodeBlock;
    }
    if (inCodeBlock) return true;

    // Allow legitimate variable names
    if (line.includes('temperature') || line.includes('template') || 
        line.includes('temporary') || line.includes('attempt')) {
      return true;
    }

    // Allow console.log in error handling
    if (line.includes('console.log') && 
        (line.includes('error') || line.includes('catch') || line.includes('warn'))) {
      return true;
    }

    // Skip TODO comments that are documentation
    if (line.includes('TODO') && 
        (line.includes('documentation') || line.includes('implement') || 
         line.includes('feature') || line.includes('add'))) {
      return true;
    }

    return false;
  }

  private analyzeFileContent(content: string, filePath: string): void {
    this.filesScanned++;
    const lines = content.split('\n');

    // Enhanced sandbox block detection patterns with context validation
    const sandboxPatterns = [
      { pattern: /\/\/\s*SANDBOX_START/gi, weight: 1 },
      { pattern: /\/\*\s*SANDBOX_START\s*\*\//gi, weight: 1 },
      { pattern: /\/\/\s*TEMP_START/gi, weight: 1 },
      { pattern: /\/\*\s*TEMP_START\s*\*\//gi, weight: 1 },
      { pattern: /\/\/\s*DEBUG_START/gi, weight: 1 },
      { pattern: /\/\*\s*DEBUG_START\s*\*\//gi, weight: 1 },
      { pattern: /\/\/\s*DEV_START/gi, weight: 1 },
      { pattern: /\/\*\s*DEV_START\s*\*\//gi, weight: 1 },
      { pattern: /\/\/\s*@sandbox/gi, weight: 0.8 },
      { pattern: /\/\*\s*@sandbox\s*\*\//gi, weight: 0.8 },
      { pattern: /\/\/\s*@dev/gi, weight: 0.6 },
      { pattern: /\/\*\s*@dev\s*\*\//gi, weight: 0.6 },
      { pattern: /\/\/\s*TODO.*remove/gi, weight: 0.7 },
      { pattern: /\/\*\s*TODO.*replace.*\*\//gi, weight: 0.7 },
      { pattern: /const\s+(temp|tmp|mock|placeholder)\w*/gi, weight: 0.5 },
      { pattern: /let\s+(temp|tmp|mock|placeholder)\w*/gi, weight: 0.5 },
      { pattern: /console\.log\(/gi, weight: 0.3 }
    ];

    let totalSandboxBlocks = 0;
    
    // Analyze each line with context validation
    lines.forEach((line, lineIndex) => {
      if (this.isLegitimateCode(line, filePath, lineIndex, lines)) {
        return; // Skip this line
      }

      sandboxPatterns.forEach(({ pattern, weight }) => {
        const matches = line.match(pattern) || [];
        totalSandboxBlocks += matches.length * weight;
      });
    });
    
    // Round to nearest integer and add to total
    this.sandboxBlocks += Math.round(totalSandboxBlocks);

    // Check for traditional paired sandbox blocks
    const sandboxStartMatches = content.match(/\/\/\s*SANDBOX_START/gi) || [];
    const sandboxEndMatches = content.match(/\/\/\s*SANDBOX_END/gi) || [];

    if (sandboxStartMatches.length !== sandboxEndMatches.length) {
      this.checks.push({
        id: `sandbox_mismatch_${filePath}`,
        name: 'Sandbox Block Integrity',
        status: 'warning',
        message: 'Mismatched SANDBOX_START/SANDBOX_END blocks',
        file_path: filePath
      });
    }

    // Check for hardcoded secrets
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{48}/g, // OpenAI API keys
      /xoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}/g, // Slack tokens
      /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal access tokens
      /AKIA[0-9A-Z]{16}/g, // AWS access keys
    ];

    secretPatterns.forEach((pattern, index) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const lineNumber = lines.findIndex(line => line.includes(match)) + 1;
          this.checks.push({
            id: `secret_exposed_${filePath}_${index}`,
            name: 'Secret Exposure',
            status: 'fail',
            message: 'Potential exposed secret detected',
            details: `Found pattern: ${match.substring(0, 8)}...`,
            file_path: filePath,
            line_number: lineNumber
          });
        });
      }
    });

    // Check for development routes
    if (filePath.includes('routes') || filePath.includes('router')) {
      const devRoutes = ['/health', '/self-test', '/dev/', '/debug/'];
      devRoutes.forEach(route => {
        if (content.includes(route)) {
          const lineNumber = lines.findIndex(line => line.includes(route)) + 1;
          this.checks.push({
            id: `dev_route_${filePath}_${route}`,
            name: 'Development Route Detection',
            status: 'warning',
            message: 'Development route found',
            details: `Route: ${route}`,
            file_path: filePath,
            line_number: lineNumber
          });
        }
      });
    }

    // Check for proper TypeScript setup
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      this.checks.push({
        id: `typescript_missing_${filePath}`,
        name: 'TypeScript Usage',
        status: 'warning',
        message: 'JavaScript file found in TypeScript project',
        file_path: filePath
      });
    }
  }

  private async checkConfiguration(): Promise<void> {
    // Check for src/config/public.ts
    const publicConfig = await this.getFileContent('src/config/public.ts');
    if (publicConfig) {
      this.checks.push({
        id: 'public_config_exists',
        name: 'Public Configuration',
        status: 'pass',
        message: 'Public configuration file found'
      });

      // Check for proper environment detection
      if (publicConfig.includes('getEnv') && publicConfig.includes('dev') && publicConfig.includes('prod')) {
        this.checks.push({
          id: 'environment_separation',
          name: 'Environment Separation',
          status: 'pass',
          message: 'Environment separation implemented'
        });
      } else {
        this.checks.push({
          id: 'environment_separation',
          name: 'Environment Separation',
          status: 'warning',
          message: 'Environment separation not properly configured'
        });
      }
    } else {
      this.checks.push({
        id: 'public_config_exists',
        name: 'Public Configuration',
        status: 'fail',
        message: 'Missing src/config/public.ts file'
      });
    }

    // Check for Supabase integration
    const supabaseClient = await this.getFileContent('src/integrations/supabase/client.ts');
    if (supabaseClient) {
      this.checks.push({
        id: 'supabase_integration',
        name: 'Supabase Integration',
        status: 'pass',
        message: 'Supabase client configuration found'
      });
    } else {
      this.checks.push({
        id: 'supabase_integration',
        name: 'Supabase Integration',
        status: 'warning',
        message: 'Supabase integration not found'
      });
    }

    // Check for package.json
    const packageJson = await this.getFileContent('package.json');
    if (packageJson) {
      const pkg = JSON.parse(packageJson);
      const lovableDeps = ['@supabase/supabase-js', 'vite', 'react', 'tailwindcss'];
      const hasLovableDeps = lovableDeps.some(dep => 
        pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]
      );

      if (hasLovableDeps) {
        this.checks.push({
          id: 'lovable_project',
          name: 'Lovable Project Structure',
          status: 'pass',
          message: 'Lovable project dependencies detected'
        });
      }
    }
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.sandboxBlocks > 0) {
      recommendations.push(`Remove ${this.sandboxBlocks} sandbox blocks before production deployment`);
    }

    const failedChecks = this.checks.filter(c => c.status === 'fail');
    if (failedChecks.length > 0) {
      recommendations.push(`Address ${failedChecks.length} critical security issues`);
    }

    const warningChecks = this.checks.filter(c => c.status === 'warning');
    if (warningChecks.length > 0) {
      recommendations.push(`Review ${warningChecks.length} warning items for production readiness`);
    }

    const devRoutes = this.checks.filter(c => c.name === 'Development Route Detection');
    if (devRoutes.length > 0) {
      recommendations.push('Configure development routes to be disabled in production');
    }

    return recommendations;
  }

  async performAudit(): Promise<AuditReport> {
    console.log(`Starting audit for ${this.owner}/${this.repo}`);

    // Check configuration first
    await this.checkConfiguration();

    // Scan all TypeScript/JavaScript files
    const filePaths = await this.scanDirectory('src');
    
    for (const filePath of filePaths) {
      const content = await this.getFileContent(filePath);
      if (content) {
        this.analyzeFileContent(content, filePath);
      }
    }

    const passed = this.checks.filter(c => c.status === 'pass').length;
    const warnings = this.checks.filter(c => c.status === 'warning').length;
    const failed = this.checks.filter(c => c.status === 'fail').length;
    
    // Calculate overall score (0-100)
    const totalChecks = this.checks.length;
    const score = totalChecks > 0 ? Math.round(((passed + (warnings * 0.5)) / totalChecks) * 100) : 0;

    return {
      repository_name: `${this.owner}/${this.repo}`,
      repository_url: `https://github.com/${this.owner}/${this.repo}`,
      scan_timestamp: new Date().toISOString(),
      overall_score: score,
      summary: {
        total_checks: totalChecks,
        passed,
        warnings,
        failed,
        sandbox_blocks: this.sandboxBlocks,
        files_scanned: this.filesScanned
      },
      checks: this.checks,
      recommendations: this.generateRecommendations()
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { github_token, repository_url, user_id } = await req.json();

    if (!github_token || !repository_url || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse repository URL to get owner and repo
    const urlMatch = repository_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      return new Response(
        JSON.stringify({ error: 'Invalid repository URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [, owner, repo] = urlMatch;
    const repoName = repo.replace('.git', '');

    console.log(`Starting audit for ${owner}/${repoName}`);

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Update audit status to running
    await supabase
      .from('repository_audits')
      .upsert({
        user_id,
        repository_name: `${owner}/${repoName}`,
        repository_url,
        audit_status: 'running',
        last_audit_date: new Date().toISOString()
      });

    // Perform the audit
    const auditor = new RepositoryAuditor(github_token, owner, repoName);
    const auditReport = await auditor.performAudit();

    // Save audit results
    const { error: saveError } = await supabase
      .from('repository_audits')
      .upsert({
        user_id,
        repository_name: auditReport.repository_name,
        repository_url: auditReport.repository_url,
        audit_status: 'completed',
        audit_results: auditReport,
        last_audit_date: auditReport.scan_timestamp
      });

    if (saveError) {
      console.error('Error saving audit results:', saveError);
      return new Response(
        JSON.stringify({ error: 'Failed to save audit results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Audit completed for ${owner}/${repoName}, score: ${auditReport.overall_score}`);

    return new Response(
      JSON.stringify({ audit_report: auditReport }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Audit error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});