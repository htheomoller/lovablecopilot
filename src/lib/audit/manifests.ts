import { FeatureManifest } from './types';

/**
 * Feature manifests for Lovable project components
 */
export const FEATURE_MANIFESTS: FeatureManifest[] = [
  {
    slug: 'auth',
    name: 'Authentication',
    description: 'User authentication and authorization system',
    flags: ['auth', 'user-management'],
    routes: ['/auth', '/login', '/signup', '/logout'],
    files: [
      'src/contexts/AuthContext.tsx',
      'src/components/AuthGate.tsx',
      'src/pages/Auth.tsx',
      'src/lib/supabase.ts'
    ],
    edge_functions: ['auth-callback'],
    db: {
      tables: ['profiles', 'auth.users'],
      policies: ['Users can view own profile', 'Users can update own profile']
    },
    env: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    cleanup_ready_when: ['auth_system_stable', 'user_profiles_implemented'],
    notes: ['Core authentication system using Supabase Auth']
  },
  {
    slug: 'dashboard',
    name: 'Dashboard',
    description: 'Main application dashboard and layout',
    flags: ['dashboard', 'main-app'],
    routes: ['/dashboard', '/'],
    files: [
      'src/pages/Dashboard.tsx',
      'src/components/AppLayout.tsx',
      'src/components/AppSidebar.tsx'
    ],
    edge_functions: [],
    db: {
      tables: [],
      policies: []
    },
    env: [],
    cleanup_ready_when: ['dashboard_layout_finalized'],
    notes: ['Main application entry point and navigation']
  },
  {
    slug: 'audit',
    name: 'Repository Audit System',
    description: 'Code repository auditing and analysis',
    flags: ['audit', 'analysis', 'security'],
    routes: ['/audit-results'],
    files: [
      'src/pages/AuditResults.tsx',
      'src/components/AuditResults.tsx',
      'src/components/RepositoryCard.tsx',
      'src/lib/audit/scanner.ts',
      'src/lib/audit/types.ts'
    ],
    edge_functions: ['repository-audit'],
    db: {
      tables: ['repository_audits'],
      policies: ['Users can view their own repository audits']
    },
    env: [],
    cleanup_ready_when: ['audit_system_stable', 'scanning_accuracy_verified'],
    notes: ['Repository analysis and security scanning system']
  },
  {
    slug: 'github',
    name: 'GitHub Integration',
    description: 'GitHub repository connection and management',
    flags: ['github', 'integration', 'vcs'],
    routes: ['/connect-repo'],
    files: [
      'src/pages/ConnectRepo.tsx',
      'src/components/GitHubConnectButton.tsx',
      'src/lib/github.ts'
    ],
    edge_functions: ['github-oauth'],
    db: {
      tables: ['profiles'],
      policies: ['Users can update own GitHub data']
    },
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    cleanup_ready_when: ['github_integration_stable', 'oauth_flow_working'],
    notes: ['GitHub OAuth and repository management']
  },
  {
    slug: 'chat',
    name: 'AI Chat Interface',
    description: 'Conversational AI interface for copilot functionality',
    flags: ['chat', 'ai', 'copilot'],
    routes: ['/chat'],
    files: [
      'src/pages/Chat.tsx',
      'src/lib/cpClient.ts'
    ],
    edge_functions: ['cp-chat', 'ai-nlu'],
    db: {
      tables: ['dev_breadcrumbs'],
      policies: ['Users can manage own breadcrumbs']
    },
    env: ['OPENAI_API_KEY'],
    cleanup_ready_when: ['chat_interface_stable', 'ai_responses_accurate'],
    notes: ['AI-powered chat interface for development assistance']
  },
  {
    slug: 'settings',
    name: 'User Settings',
    description: 'User preferences and configuration management',
    flags: ['settings', 'config', 'preferences'],
    routes: ['/settings'],
    files: [
      'src/pages/Settings.tsx'
    ],
    edge_functions: [],
    db: {
      tables: ['profiles', 'project_guidelines'],
      policies: ['Users can update own settings']
    },
    env: [],
    cleanup_ready_when: ['settings_ui_complete'],
    notes: ['User preference management and configuration']
  },
  {
    slug: 'roadmap',
    name: 'Project Roadmap',
    description: 'Project planning and milestone tracking',
    flags: ['roadmap', 'planning', 'milestones'],
    routes: ['/roadmap'],
    files: [
      'src/pages/Roadmap.tsx'
    ],
    edge_functions: ['seed-milestones'],
    db: {
      tables: ['ledger_milestones', 'cp_projects'],
      policies: ['Users can manage own project milestones']
    },
    env: [],
    cleanup_ready_when: ['roadmap_functionality_complete'],
    notes: ['Project milestone and roadmap management']
  },
  {
    slug: 'health',
    name: 'System Health Monitoring',
    description: 'Application health checks and system monitoring',
    flags: ['health', 'monitoring', 'diagnostics'],
    routes: ['/health', '/self-test'],
    files: [
      'src/pages/Health.tsx',
      'src/lib/selfTests.ts'
    ],
    edge_functions: ['hello'],
    db: {
      tables: [],
      policies: []
    },
    env: [],
    cleanup_ready_when: ['health_checks_stable', 'monitoring_complete'],
    notes: ['System health monitoring and diagnostics']
  }
];

/**
 * Gets a feature manifest by slug
 */
export function getFeatureManifest(slug: string): FeatureManifest | undefined {
  return FEATURE_MANIFESTS.find(manifest => manifest.slug === slug);
}

/**
 * Gets all feature manifests
 */
export function getAllFeatureManifests(): FeatureManifest[] {
  return FEATURE_MANIFESTS;
}

/**
 * Finds manifests that include a specific file
 */
export function getManifestsForFile(filePath: string): FeatureManifest[] {
  return FEATURE_MANIFESTS.filter(manifest => 
    manifest.files.some(file => filePath.includes(file) || file.includes(filePath))
  );
}

/**
 * Finds manifests that include a specific route
 */
export function getManifestsForRoute(route: string): FeatureManifest[] {
  return FEATURE_MANIFESTS.filter(manifest =>
    manifest.routes.some(manifestRoute => route.includes(manifestRoute))
  );
}