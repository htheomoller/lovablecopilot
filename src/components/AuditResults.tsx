import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  ChevronDown,
  Download,
  FileText,
  Shield,
  Settings,
  Code
} from 'lucide-react';

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

interface AuditResultsProps {
  auditReport: AuditReport;
  onClose?: () => void;
}

export const AuditResults = ({ auditReport, onClose }: AuditResultsProps) => {
  const [expandedSections, setExpandedSections] = useState<string[]>(['summary']);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pass: 'default',
      warning: 'secondary',
      fail: 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const groupChecksByCategory = (checks: AuditCheck[]) => {
    const categories: { [key: string]: AuditCheck[] } = {
      configuration: [],
      security: [],
      code_quality: [],
      other: []
    };

    checks.forEach(check => {
      if (check.name.toLowerCase().includes('config') || check.name.toLowerCase().includes('environment')) {
        categories.configuration.push(check);
      } else if (check.name.toLowerCase().includes('secret') || check.name.toLowerCase().includes('security')) {
        categories.security.push(check);
      } else if (check.name.toLowerCase().includes('typescript') || check.name.toLowerCase().includes('sandbox')) {
        categories.code_quality.push(check);
      } else {
        categories.other.push(check);
      }
    });

    return categories;
  };

  const downloadReport = () => {
    const markdownReport = generateMarkdownReport(auditReport);
    const blob = new Blob([markdownReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${auditReport.repository_name.replace('/', '-')}-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const categorizedChecks = groupChecksByCategory(auditReport.checks);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-2xl font-bold">Audit Report</CardTitle>
            <CardDescription>
              {auditReport.repository_name} • {new Date(auditReport.scan_timestamp).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadReport}>
              <Download className="w-4 h-4 mr-2" />
              Download Report
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-3xl font-bold ${getScoreColor(auditReport.overall_score)}`}>
                {auditReport.overall_score}
              </div>
              <div className="text-sm text-muted-foreground">Overall Score</div>
              <Progress value={auditReport.overall_score} className="mt-2" />
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">{auditReport.summary.passed}</div>
              <div className="text-sm text-muted-foreground">Passed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-600">{auditReport.summary.warnings}</div>
              <div className="text-sm text-muted-foreground">Warnings</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{auditReport.summary.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>Files Scanned: <span className="font-medium">{auditReport.summary.files_scanned}</span></div>
            <div>Sandbox Blocks: <span className="font-medium">{auditReport.summary.sandbox_blocks}</span></div>
          </div>
        </CardContent>
      </Card>

      {auditReport.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {auditReport.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <span className="text-sm">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Configuration Checks */}
      {categorizedChecks.configuration.length > 0 && (
        <Card>
          <Collapsible open={expandedSections.includes('configuration')} onOpenChange={() => toggleSection('configuration')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Configuration ({categorizedChecks.configuration.length})
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.includes('configuration') ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-3">
                  {categorizedChecks.configuration.map((check) => (
                    <div key={check.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      {getStatusIcon(check.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{check.name}</span>
                          {getStatusBadge(check.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">{check.message}</p>
                        {check.details && (
                          <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                        )}
                        {check.file_path && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {check.file_path}{check.line_number ? `:${check.line_number}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Security Checks */}
      {categorizedChecks.security.length > 0 && (
        <Card>
          <Collapsible open={expandedSections.includes('security')} onOpenChange={() => toggleSection('security')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Security ({categorizedChecks.security.length})
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.includes('security') ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-3">
                  {categorizedChecks.security.map((check) => (
                    <div key={check.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      {getStatusIcon(check.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{check.name}</span>
                          {getStatusBadge(check.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">{check.message}</p>
                        {check.details && (
                          <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                        )}
                        {check.file_path && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {check.file_path}{check.line_number ? `:${check.line_number}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Code Quality Checks */}
      {categorizedChecks.code_quality.length > 0 && (
        <Card>
          <Collapsible open={expandedSections.includes('code_quality')} onOpenChange={() => toggleSection('code_quality')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code className="w-5 h-5" />
                    Code Quality ({categorizedChecks.code_quality.length})
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.includes('code_quality') ? 'rotate-180' : ''}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-3">
                  {categorizedChecks.code_quality.map((check) => (
                    <div key={check.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      {getStatusIcon(check.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{check.name}</span>
                          {getStatusBadge(check.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">{check.message}</p>
                        {check.details && (
                          <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                        )}
                        {check.file_path && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {check.file_path}{check.line_number ? `:${check.line_number}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
};

function generateMarkdownReport(report: AuditReport): string {
  let markdown = `# Audit Report: ${report.repository_name}\n\n`;
  markdown += `**Repository:** ${report.repository_url}\n`;
  markdown += `**Scan Date:** ${new Date(report.scan_timestamp).toLocaleDateString()}\n`;
  markdown += `**Overall Score:** ${report.overall_score}/100\n\n`;

  markdown += `## Summary\n\n`;
  markdown += `- **Files Scanned:** ${report.summary.files_scanned}\n`;
  markdown += `- **Total Checks:** ${report.summary.total_checks}\n`;
  markdown += `- **Passed:** ${report.summary.passed}\n`;
  markdown += `- **Warnings:** ${report.summary.warnings}\n`;
  markdown += `- **Failed:** ${report.summary.failed}\n`;
  markdown += `- **Sandbox Blocks Found:** ${report.summary.sandbox_blocks}\n\n`;

  if (report.recommendations.length > 0) {
    markdown += `## Recommendations\n\n`;
    report.recommendations.forEach(rec => {
      markdown += `- ${rec}\n`;
    });
    markdown += `\n`;
  }

  markdown += `## Detailed Results\n\n`;
  report.checks.forEach(check => {
    const status = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
    markdown += `### ${status} ${check.name}\n\n`;
    markdown += `**Status:** ${check.status.toUpperCase()}\n`;
    markdown += `**Message:** ${check.message}\n`;
    
    if (check.details) {
      markdown += `**Details:** ${check.details}\n`;
    }
    
    if (check.file_path) {
      markdown += `**File:** ${check.file_path}`;
      if (check.line_number) {
        markdown += `:${check.line_number}`;
      }
      markdown += `\n`;
    }
    
    markdown += `\n`;
  });

  return markdown;
}