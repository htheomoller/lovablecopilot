import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AuditResults as AuditResultsComponent } from '@/components/AuditResults';
import { AppLayout } from '@/components/AppLayout';
import { 
  Shield, 
  Calendar, 
  GitBranch, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

interface AuditRecord {
  id: string;
  repository_name: string;
  audit_status: string;
  audit_results: any;
  last_audit_date: string;
  created_at: string;
}

const AuditResults = () => {
  const { user } = useAuth();
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAudit, setSelectedAudit] = useState<AuditRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user) {
      fetchAuditRecords();
    }
  }, [user]);

  const fetchAuditRecords = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('repository_audits')
        .select('*')
        .eq('user_id', user?.id)
        .order('last_audit_date', { ascending: false });

      if (error) {
        throw error;
      }

      setAuditRecords(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch audit records",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'running':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getOverallScore = (auditResults: any) => {
    if (!auditResults?.overall_score) return 'N/A';
    return `${auditResults.overall_score}/100`;
  };

  const filteredRecords = auditRecords.filter(record =>
    record.repository_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (selectedAudit) {
    return (
      <AppLayout>
        <div className="p-6 bg-page-background min-h-screen">
          <div className="mb-6">
            <Button
              onClick={() => setSelectedAudit(null)}
              variant="ghost"
              className="mb-4"
            >
              ← Back to Audit Results
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">
              Audit Results - {selectedAudit.repository_name}
            </h1>
            <p className="text-muted-foreground">
              Last audited on {new Date(selectedAudit.last_audit_date).toLocaleDateString()}
            </p>
          </div>

          {selectedAudit.audit_results && (
            <AuditResultsComponent auditReport={selectedAudit.audit_results} />
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 bg-page-background min-h-screen">
        <div className="mb-6">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading audit results...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Audit Results</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchTerm 
                  ? `No audit results found for "${searchTerm}"`
                  : "You haven't run any repository audits yet."
                }
              </p>
              <Button onClick={() => window.location.href = '/connect-repo'}>
                Connect Repository
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredRecords.map((record) => (
              <Card key={record.id} className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedAudit(record)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <GitBranch className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-lg">{record.repository_name}</CardTitle>
                        <CardDescription className="flex items-center space-x-4 mt-1">
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(record.last_audit_date).toLocaleDateString()}
                          </span>
                          <span>Score: {getOverallScore(record.audit_results)}</span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={getStatusVariant(record.audit_status)} className="flex items-center gap-1">
                        {getStatusIcon(record.audit_status)}
                        {record.audit_status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                
                {record.audit_results && (
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{record.audit_results.summary?.total_passed || 0} Passed</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <span>{record.audit_results.summary?.total_warnings || 0} Warnings</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span>{record.audit_results.summary?.total_failed || 0} Failed</span>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default AuditResults;