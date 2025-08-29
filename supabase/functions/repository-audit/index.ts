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
  private fileContents: Map<string, string> = new Map();

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
        if (item.type === 'file') {
          // Include all relevant file types
          const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
          if (relevantExtensions.some(ext => item.name.endsWith(ext))) {
            filePaths.push(item.path);
          }
        } else if (item.type === 'dir') {
          // Exclude common directories
          const excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.nyc_output'];
          if (!excludeDirs.includes(item.name) && !item.name.startsWith('.')) {
            const subFiles = await this.scanDirectory(item.path);
            filePaths.push(...subFiles);
          }
        }
      }

      return filePaths;
    } catch (error) {
      console.error(`Error scanning directory ${path}:`, error);
      return [];
    }
  }

  private countSandboxBlocks(): number {
    let totalBlocks = 0;

    // Simple, proven regex patterns
    const sandboxPatterns = [
      /\/\/\s*SANDBOX_START/gi,
      /\/\*\s*SANDBOX_START\s*\*\//gi,
      /\/\/\s*DEV_START/gi,
      /\/\*\s*DEV_START\s*\*\//gi,
      /\/\/\s*TEMP_START/gi,
      /\/\*\s*TEMP_START\s*\*\//gi,
      /\/\/\s*DEBUG_START/gi,
      /\/\*\s*DEBUG_START\s*\*\//gi
    ];

    for (const [filePath, content] of this.fileContents.entries()) {
      // Skip non-code files
      if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) continue;

      // Count pattern matches
      for (const pattern of sandboxPatterns) {
        const matches = content.match(pattern) || [];
        totalBlocks += matches.length;
      }
    }

    return totalBlocks;
  }

  private generateSecurityChecks(): AuditCheck[] {
    const checks: AuditCheck[] = [];

    // Count sandbox blocks
    const sandboxBlocks = this.countSandboxBlocks();
    if (sandboxBlocks > 0) {
      checks.push({
        id: 'sandbox_blocks',
        name: 'Sandbox Block Detection',
        status: sandboxBlocks > 10 ? 'fail' : 'warning',
        message: `Found ${sandboxBlocks} sandbox blocks`,
        details: 'Remove all sandbox blocks before production deployment'
      });
    } else {
      checks.push({
        id: 'sandbox_blocks',
        name: 'Sandbox Block Detection',
        status: 'pass',
        message: 'No sandbox blocks detected'
      });
    }

    // Check for auth implementation  
    const hasAuthContext = this.fileContents.has('src/contexts/AuthContext.tsx');
    const hasAuthGate = this.fileContents.has('src/components/AuthGate.tsx');
    
    if (hasAuthContext && hasAuthGate) {
      checks.push({
        id: 'auth_implementation',
        name: 'Authentication System',
        status: 'pass',
        message: 'Authentication system properly implemented'
      });
    } else {
      checks.push({
        id: 'auth_implementation', 
        name: 'Authentication System',
        status: 'warning',
        message: 'Authentication system may be incomplete',
        details: `Missing: ${!hasAuthContext ? 'AuthContext ' : ''}${!hasAuthGate ? 'AuthGate' : ''}`
      });
    }

    // Check for potential security issues
    let hasConsoleLog = false;
    let hasHardcodedSecrets = false;

    for (const [filePath, content] of this.fileContents.entries()) {
      if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) continue;

      // Check for console.log statements
      if (content.includes('console.log') && !hasConsoleLog) {
        hasConsoleLog = true;
      }

      // Check for potential hardcoded secrets
      const secretPatterns = [
        /api[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9]{10,}/gi,
        /secret["\s]*[:=]["\s]*[a-zA-Z0-9]{10,}/gi,
        /token["\s]*[:=]["\s]*[a-zA-Z0-9]{10,}/gi
      ];

      for (const pattern of secretPatterns) {
        if (pattern.test(content) && !hasHardcodedSecrets) {
          hasHardcodedSecrets = true;
          break;
        }
      }
    }

    if (hasConsoleLog) {
      checks.push({
        id: 'console_statements',
        name: 'Console Statements',
        status: 'warning',
        message: 'Console.log statements found',
        details: 'Remove console.log statements before production'
      });
    }

    if (hasHardcodedSecrets) {
      checks.push({
        id: 'hardcoded_secrets',
        name: 'Hardcoded Secrets',
        status: 'fail',
        message: 'Potential hardcoded secrets detected',
        details: 'Move secrets to environment variables'
      });
    }

    return checks;
  }

  async performAudit(): Promise<AuditReport> {
    console.log(`Starting audit for ${this.owner}/${this.repo}`);

    // Scan all files recursively
    const filePaths = await this.scanDirectory();
    console.log(`Found ${filePaths.length} files to analyze`);
    
    // Load file contents
    for (const filePath of filePaths) {
      const content = await this.getFileContent(filePath);
      if (content) {
        this.fileContents.set(filePath, content);
      }
    }

    console.log(`Successfully loaded ${this.fileContents.size} files`);

    // Generate security checks
    const checks = this.generateSecurityChecks();
    
    // Calculate summary
    const passed = checks.filter(c => c.status === 'pass').length;
    const warnings = checks.filter(c => c.status === 'warning').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const sandboxBlocks = this.countSandboxBlocks();
    
    // Calculate score
    const totalChecks = checks.length;
    const score = totalChecks > 0 ? Math.round(((passed + (warnings * 0.5)) / totalChecks) * 100) : 100;

    // Generate recommendations
    const recommendations: string[] = [];
    if (sandboxBlocks > 0) {
      recommendations.push(`Remove ${sandboxBlocks} sandbox blocks before production`);
    }
    if (failed > 0) {
      recommendations.push(`Address ${failed} critical security issues`);
    }
    if (warnings > 0) {
      recommendations.push(`Review ${warnings} warnings for production readiness`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Repository appears production-ready');
    }

    const auditReport: AuditReport = {
      repository_name: `${this.owner}/${this.repo}`,
      repository_url: `https://github.com/${this.owner}/${this.repo}`,
      scan_timestamp: new Date().toISOString(),
      overall_score: score,
      summary: {
        total_checks: totalChecks,
        passed,
        warnings,
        failed,
        sandbox_blocks: sandboxBlocks,
        files_scanned: this.fileContents.size
      },
      checks,
      recommendations
    };

    console.log(`Audit completed: ${this.fileContents.size} files scanned, ${sandboxBlocks} sandbox blocks found, score: ${score}`);

    return auditReport;
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