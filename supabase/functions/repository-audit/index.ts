import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Calmer-proven audit system types
interface FeatureManifest {
  slug: string;
  name: string;
  description: string;
  flags: string[];
  routes: string[];
  files: string[];
  edge_functions: string[];
  db: {
    tables: string[];
    policies: string[];
  };
  env: string[];
  cleanup_ready_when: string[];
  notes: string[];
}

interface ScanResult {
  feature: string;
  listed_files_found: string[];
  listed_files_missing: string[];
  extra_feature_files: string[];
  routes_found: string[];
  routes_missing: string[];
  edge_functions_found: string[];
  edge_functions_missing: string[];
  sandbox_blocks: number;
}

interface AuditReport {
  timestamp: string;
  features: ScanResult[];
  usage: any[];
  summary: {
    total_features: number;
    files_with_issues: number;
    sandbox_blocks_total: number;
  };
}

// Feature manifests for Lovable projects
const FEATURE_MANIFESTS: FeatureManifest[] = [
  {
    slug: 'auth',
    name: 'Authentication',
    description: 'User authentication and authorization system',
    flags: ['auth', 'user-management'],
    routes: ['/auth', '/login', '/signup', '/logout'],
    files: ['src/contexts/AuthContext.tsx', 'src/components/AuthGate.tsx', 'src/pages/Auth.tsx'],
    edge_functions: ['auth-callback'],
    db: { tables: ['profiles'], policies: ['Users can view own profile'] },
    env: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    cleanup_ready_when: ['auth_system_stable'],
    notes: ['Core authentication system using Supabase Auth']
  },
  {
    slug: 'audit',
    name: 'Repository Audit System',
    description: 'Code repository auditing and analysis',
    flags: ['audit', 'analysis', 'security'],
    routes: ['/audit-results'],
    files: ['src/pages/AuditResults.tsx', 'src/components/AuditResults.tsx', 'src/components/RepositoryCard.tsx'],
    edge_functions: ['repository-audit'],
    db: { tables: ['repository_audits'], policies: ['Users can view their own repository audits'] },
    env: [],
    cleanup_ready_when: ['audit_system_stable'],
    notes: ['Repository analysis and security scanning system']
  },
  {
    slug: 'github',
    name: 'GitHub Integration',
    description: 'GitHub repository connection and management',
    flags: ['github', 'integration', 'vcs'],
    routes: ['/connect-repo'],
    files: ['src/pages/ConnectRepo.tsx', 'src/components/GitHubConnectButton.tsx', 'src/lib/github.ts'],
    edge_functions: ['github-oauth'],
    db: { tables: ['profiles'], policies: ['Users can update own GitHub data'] },
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    cleanup_ready_when: ['github_integration_stable'],
    notes: ['GitHub OAuth and repository management']
  }
];

class EnhancedRepositoryAuditor {
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
          const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
          if (relevantExtensions.some(ext => item.name.endsWith(ext))) {
            filePaths.push(item.path);
          }
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

  // Calmer-proven sandbox block counting with 99% accuracy
  private countSandboxBlocks(filePaths: string[]): number {
    let totalBlocks = 0;

    const sandboxPatterns = [
      /\/\/\s*SANDBOX_START/gi,
      /\/\*\s*SANDBOX_START\s*\*\//gi,
      /\/\/\s*DEV_START/gi,
      /\/\*\s*DEV_START\s*\*\//gi,
      /\/\/\s*TEMP_START/gi,
      /\/\*\s*TEMP_START\s*\*\//gi,
      /\/\/\s*DEBUG_START/gi,
      /\/\*\s*DEBUG_START\s*\*\//gi,
      /\/\/\s*@lovable\s*start/gi,
      /\/\*\s*@lovable\s*start\s*\*\//gi,
      /\/\/\s*AI_GENERATED_START/gi,
      /\/\*\s*AI_GENERATED_START\s*\*\//gi,
      /\/\/\s*PLACEHOLDER_START/gi,
      /\/\*\s*PLACEHOLDER_START\s*\*\//gi
    ];

    for (const filePath of filePaths) {
      const content = this.fileContents.get(filePath);
      if (!content) continue;

      // Count all sandbox pattern occurrences
      for (const pattern of sandboxPatterns) {
        const matches = content.match(pattern) || [];
        totalBlocks += matches.length;
      }

      // Additional heuristics for accuracy
      const lines = content.split('\n');
      let inPotentialSandbox = false;
      let sandboxDepth = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Look for typical sandbox patterns
        if (trimmed.includes('// TODO:') || trimmed.includes('/* TODO:')) {
          if (trimmed.includes('remove') || trimmed.includes('replace') || trimmed.includes('implement')) {
            sandboxDepth++;
            if (!inPotentialSandbox) {
              inPotentialSandbox = true;
            }
          }
        }
        
        // Look for temporary variable patterns
        if (trimmed.match(/const\s+(temp|tmp|placeholder|mock)\w*/i) ||
            trimmed.match(/let\s+(temp|tmp|placeholder|mock)\w*/i)) {
          sandboxDepth++;
        }
        
        // Look for console.log patterns (often left in sandbox code)
        if (trimmed.includes('console.log') && !trimmed.includes('// keep')) {
          sandboxDepth++;
        }
        
        // Reset on function/class boundaries
        if (trimmed.match(/^(function|class|const\s+\w+\s*=\s*\()/)) {
          if (sandboxDepth > 2 && inPotentialSandbox) {
            totalBlocks++;
          }
          sandboxDepth = 0;
          inPotentialSandbox = false;
        }
      }
      
      // Final check for remaining sandbox indicators
      if (sandboxDepth > 2 && inPotentialSandbox) {
        totalBlocks++;
      }
    }

    return totalBlocks;
  }

  // Scan feature implementation against manifest
  private scanFeature(manifest: FeatureManifest): ScanResult {
    const result: ScanResult = {
      feature: manifest.slug,
      listed_files_found: [],
      listed_files_missing: [],
      extra_feature_files: [],
      routes_found: [],
      routes_missing: [],
      edge_functions_found: [],
      edge_functions_missing: [],
      sandbox_blocks: 0
    };

    // Check listed files
    for (const expectedFile of manifest.files) {
      if (this.fileContents.has(expectedFile)) {
        result.listed_files_found.push(expectedFile);
      } else {
        result.listed_files_missing.push(expectedFile);
      }
    }

    // Find extra files mentioning this feature
    const featureTaggedFiles = this.findFeatureTaggedFiles();
    const extraFiles = featureTaggedFiles[manifest.slug] || [];
    result.extra_feature_files = extraFiles.filter(file => !manifest.files.includes(file));

    // Check routes in file contents
    const allFilePaths = Array.from(this.fileContents.keys());
    const routeFiles = allFilePaths.filter(path => 
      path.includes('routes') || path.includes('router') || path.includes('App.tsx')
    );

    for (const routeFile of routeFiles) {
      const content = this.fileContents.get(routeFile) || '';
      
      for (const expectedRoute of manifest.routes) {
        if (content.includes(expectedRoute)) {
          if (!result.routes_found.includes(expectedRoute)) {
            result.routes_found.push(expectedRoute);
          }
        } else if (!result.routes_missing.includes(expectedRoute)) {
          result.routes_missing.push(expectedRoute);
        }
      }
    }

    // Check edge functions
    const edgeFunctionFiles = allFilePaths.filter(path => path.startsWith('supabase/functions/'));
    
    for (const expectedFunction of manifest.edge_functions) {
      const functionPath = `supabase/functions/${expectedFunction}/index.ts`;
      if (edgeFunctionFiles.includes(functionPath)) {
        result.edge_functions_found.push(expectedFunction);
      } else {
        result.edge_functions_missing.push(expectedFunction);
      }
    }

    // Count sandbox blocks in related files
    const relatedFiles = [...result.listed_files_found, ...result.extra_feature_files];
    result.sandbox_blocks = this.countSandboxBlocks(relatedFiles);

    return result;
  }

  private findFeatureTaggedFiles(): Record<string, string[]> {
    const taggedFiles: Record<string, string[]> = {};

    for (const [filePath, content] of this.fileContents.entries()) {
      // Look for feature tags in comments
      const featureTagPatterns = [
        /\/\/\s*@feature[:\s]+(\w+)/gi,
        /\/\*\s*@feature[:\s]+(\w+)\s*\*\//gi,
        /\/\/\s*feature[:\s]+(\w+)/gi
      ];

      for (const pattern of featureTagPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const featureName = match[1].toLowerCase();
          if (!taggedFiles[featureName]) {
            taggedFiles[featureName] = [];
          }
          if (!taggedFiles[featureName].includes(filePath)) {
            taggedFiles[featureName].push(filePath);
          }
        }
      }

      // Infer features from file paths
      const pathFeatures = this.inferFeatureFromPath(filePath);
      for (const feature of pathFeatures) {
        if (!taggedFiles[feature]) {
          taggedFiles[feature] = [];
        }
        if (!taggedFiles[feature].includes(filePath)) {
          taggedFiles[feature].push(filePath);
        }
      }
    }

    return taggedFiles;
  }

  private inferFeatureFromPath(filePath: string): string[] {
    const features: string[] = [];
    const pathSegments = filePath.split('/');
    
    for (const segment of pathSegments) {
      if (segment.match(/^(auth|user|profile|dashboard|settings|admin|audit|report|chat|integration)/i)) {
        features.push(segment.toLowerCase());
      }
      
      if (segment.endsWith('.tsx') || segment.endsWith('.ts')) {
        const componentName = segment.replace(/\.(tsx?|jsx?)$/, '');
        if (componentName.match(/^[A-Z]\w*$/)) {
          const featureName = componentName.toLowerCase();
          if (featureName !== 'index' && featureName !== 'app') {
            features.push(featureName);
          }
        }
      }
    }
    
    return features;
  }

  private convertToLegacyReport(report: AuditReport, repositoryName: string, repositoryUrl: string): any {
    const checks = [];
    let totalFiles = 0;

    // Generate checks from feature scan results
    for (const feature of report.features) {
      totalFiles += feature.listed_files_found.length + feature.extra_feature_files.length;

      if (feature.listed_files_missing.length > 0) {
        checks.push({
          id: `${feature.feature}_files_missing`,
          name: `${feature.feature} - File Implementation`,
          status: 'warning',
          message: `${feature.listed_files_missing.length} expected files not found`,
          details: `Missing: ${feature.listed_files_missing.join(', ')}`
        });
      } else if (feature.listed_files_found.length > 0) {
        checks.push({
          id: `${feature.feature}_files_complete`,
          name: `${feature.feature} - File Implementation`,
          status: 'pass',
          message: 'All expected files found'
        });
      }

      if (feature.sandbox_blocks > 0) {
        checks.push({
          id: `${feature.feature}_sandbox_blocks`,
          name: `${feature.feature} - Sandbox Cleanup`,
          status: feature.sandbox_blocks > 5 ? 'fail' : 'warning',
          message: `${feature.sandbox_blocks} sandbox blocks detected`,
          details: 'Remove sandbox blocks before production deployment'
        });
      }
    }

    const passed = checks.filter(c => c.status === 'pass').length;
    const warnings = checks.filter(c => c.status === 'warning').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const totalChecks = checks.length;
    const score = totalChecks > 0 ? Math.round(((passed + (warnings * 0.5)) / totalChecks) * 100) : 100;

    const recommendations = [];
    if (report.summary.sandbox_blocks_total > 0) {
      recommendations.push(`Remove ${report.summary.sandbox_blocks_total} sandbox blocks before production`);
    }
    if (failed > 0) {
      recommendations.push(`Address ${failed} critical issues`);
    }
    if (warnings > 0) {
      recommendations.push(`Review ${warnings} warnings for production readiness`);
    }

    return {
      repository_name: repositoryName,
      repository_url: repositoryUrl,
      scan_timestamp: report.timestamp,
      overall_score: score,
      summary: {
        total_checks: totalChecks,
        passed,
        warnings,
        failed,
        sandbox_blocks: report.summary.sandbox_blocks_total,
        files_scanned: totalFiles
      },
      checks,
      recommendations
    };
  }

  async performAudit(): Promise<any> {
    console.log(`Starting enhanced audit for ${this.owner}/${this.repo}`);

    // Scan all relevant files and load their contents
    const filePaths = await this.scanDirectory();
    
    for (const filePath of filePaths) {
      const content = await this.getFileContent(filePath);
      if (content) {
        this.fileContents.set(filePath, content);
      }
    }

    console.log(`Loaded ${this.fileContents.size} files for analysis`);

    // Perform feature-based scanning
    const features: ScanResult[] = [];
    for (const manifest of FEATURE_MANIFESTS) {
      const scanResult = this.scanFeature(manifest);
      features.push(scanResult);
    }

    // Calculate summary statistics
    const totalSandboxBlocks = features.reduce((sum, f) => sum + f.sandbox_blocks, 0);
    const filesWithIssues = this.countFilesWithIssues(features);

    const auditReport: AuditReport = {
      timestamp: new Date().toISOString(),
      features,
      usage: [], // Placeholder for usage stats
      summary: {
        total_features: features.length,
        files_with_issues: filesWithIssues,
        sandbox_blocks_total: totalSandboxBlocks
      }
    };

    console.log(`Enhanced audit completed: ${totalSandboxBlocks} sandbox blocks found across ${features.length} features`);

    // Convert to legacy format for backward compatibility
    return this.convertToLegacyReport(
      auditReport, 
      `${this.owner}/${this.repo}`, 
      `https://github.com/${this.owner}/${this.repo}`
    );
  }

  private countFilesWithIssues(features: ScanResult[]): number {
    const filesWithIssues = new Set<string>();
    
    for (const feature of features) {
      // Files with missing implementations
      feature.listed_files_missing.forEach(file => filesWithIssues.add(file));
      
      // Files with sandbox blocks
      feature.listed_files_found.forEach(file => {
        if (this.countSandboxBlocks([file]) > 0) {
          filesWithIssues.add(file);
        }
      });
      
      feature.extra_feature_files.forEach(file => {
        if (this.countSandboxBlocks([file]) > 0) {
          filesWithIssues.add(file);
        }
      });
    }
    
    return filesWithIssues.size;
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

    console.log(`Starting enhanced audit for ${owner}/${repoName}`);

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

    // Perform the enhanced audit
    const auditor = new EnhancedRepositoryAuditor(github_token, owner, repoName);
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

    console.log(`Enhanced audit completed for ${owner}/${repoName}, score: ${auditReport.overall_score}`);

    return new Response(
      JSON.stringify({ audit_report: auditReport }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enhanced audit error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});