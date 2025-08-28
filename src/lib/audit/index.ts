import { AuditReport, ScanResult, UsageStats } from './types';
import { scanFeature, countSandboxBlocks, findFeatureTaggedFiles } from './scanner';
import { getAllFeatureManifests } from './manifests';
import { generateMarkdownReport, convertToLegacyReport } from './reports';

export * from './types';
export * from './scanner';
export * from './manifests';
export * from './reports';

/**
 * Main audit orchestrator that performs comprehensive repository analysis
 */
export class RepositoryAuditor {
  private fileContents: Map<string, string> = new Map();
  
  constructor(fileContents: Map<string, string>) {
    this.fileContents = fileContents;
  }

  /**
   * Performs comprehensive audit using Calmer-proven methodology
   */
  async performAudit(): Promise<AuditReport> {
    const timestamp = new Date().toISOString();
    const manifests = getAllFeatureManifests();
    const features: ScanResult[] = [];
    
    // Scan each feature against its manifest
    for (const manifest of manifests) {
      const scanResult = scanFeature(manifest, this.fileContents);
      features.push(scanResult);
    }
    
    // Generate usage statistics (placeholder for now - would integrate with analytics)
    const usage: UsageStats[] = this.generateUsageStats(features);
    
    // Calculate summary statistics
    const totalSandboxBlocks = features.reduce((sum, f) => sum + f.sandbox_blocks, 0);
    const filesWithIssues = this.countFilesWithIssues(features);
    
    const report: AuditReport = {
      timestamp,
      features,
      usage,
      summary: {
        total_features: features.length,
        files_with_issues: filesWithIssues,
        sandbox_blocks_total: totalSandboxBlocks
      }
    };
    
    return report;
  }
  
  /**
   * Performs audit and returns legacy format for backward compatibility
   */
  async performLegacyAudit(repositoryName: string, repositoryUrl: string): Promise<any> {
    const auditReport = await this.performAudit();
    return convertToLegacyReport(auditReport, repositoryName, repositoryUrl);
  }
  
  private generateUsageStats(features: ScanResult[]): UsageStats[] {
    // Placeholder implementation - in a real system this would integrate with analytics
    return features.map(feature => ({
      feature: feature.feature,
      period_days: 30,
      event_counts: {},
      last_activity: null
    }));
  }
  
  private countFilesWithIssues(features: ScanResult[]): number {
    const filesWithIssues = new Set<string>();
    
    for (const feature of features) {
      // Files with missing implementations
      feature.listed_files_missing.forEach(file => filesWithIssues.add(file));
      
      // Files with sandbox blocks
      feature.listed_files_found.forEach(file => {
        const content = this.fileContents.get(file);
        if (content && countSandboxBlocks([file], this.fileContents) > 0) {
          filesWithIssues.add(file);
        }
      });
      
      feature.extra_feature_files.forEach(file => {
        const content = this.fileContents.get(file);
        if (content && countSandboxBlocks([file], this.fileContents) > 0) {
          filesWithIssues.add(file);
        }
      });
    }
    
    return filesWithIssues.size;
  }
}

/**
 * Utility function to create file contents map from GitHub API responses
 */
export function createFileContentsMap(
  filePaths: string[], 
  getFileContent: (path: string) => Promise<string | null>
): Promise<Map<string, string>> {
  return new Promise(async (resolve) => {
    const fileContents = new Map<string, string>();
    
    for (const filePath of filePaths) {
      const content = await getFileContent(filePath);
      if (content) {
        fileContents.set(filePath, content);
      }
    }
    
    resolve(fileContents);
  });
}

/**
 * Scans directory structure to find all relevant files
 */
export function getRelevantFiles(allFiles: string[]): string[] {
  const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
  const excludePatterns = [
    'node_modules/',
    '.git/',
    'dist/',
    'build/',
    '.next/',
    'coverage/',
    '.nyc_output/',
    'bun.lockb',
    'package-lock.json'
  ];
  
  return allFiles.filter(file => {
    // Include files with relevant extensions
    const hasRelevantExtension = relevantExtensions.some(ext => file.endsWith(ext));
    if (!hasRelevantExtension) return false;
    
    // Exclude files matching exclude patterns
    const isExcluded = excludePatterns.some(pattern => file.includes(pattern));
    if (isExcluded) return false;
    
    return true;
  });
}