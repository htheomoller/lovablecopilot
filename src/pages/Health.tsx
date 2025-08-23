import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { runAllTests, type TestResult } from '@/lib/selfTests';
import { logBreadcrumb, getBreadcrumbs } from '@/lib/devlog';
import { useNavigate } from 'react-router-dom';

const Health = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [milestonesCount, setMilestonesCount] = useState<number | null>(null);
  const [breadcrumbsCount, setBreadcrumbsCount] = useState<number | null>(null);
  
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
  
  // Redirect non-dev environments
  if (!isDev) {
    navigate('/', { replace: true });
    return null;
  }
  
  if (loading) {
    return <div className="p-8">Loading...</div>;
  }
  
  if (!user) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Authentication Required</CardTitle>
            <CardDescription>Please log in to access health checks</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  const runSelfTests = async () => {
    setRunning(true);
    try {
      // Load data counts
      const [milestonesRes, breadcrumbsRes] = await Promise.all([
        supabase.from('ledger_milestones').select('*', { count: 'exact', head: true }),
        supabase.from('dev_breadcrumbs').select('*', { count: 'exact', head: true })
      ]);
      
      setMilestonesCount(milestonesRes.count || 0);
      setBreadcrumbsCount(breadcrumbsRes.count || 0);
      
      // Run tests
      const results = await runAllTests();
      setTestResults(results);
      
      // Log health check
      await logBreadcrumb({
        scope: 'health-check',
        summary: 'Health page self-tests completed',
        details: {
          passed: results.filter(r => r.passed).length,
          total: results.length,
          milestonesCount: milestonesRes.count,
          breadcrumbsCount: breadcrumbsRes.count
        },
        tags: ['health', 'self-test']
      });
    } catch (error) {
      console.error('Self-tests failed:', error);
      await logBreadcrumb({
        scope: 'health-check',
        summary: 'Health check failed with error',
        details: { error: String(error) },
        tags: ['health', 'error']
      });
    } finally {
      setRunning(false);
    }
  };
  
  const createSampleData = async () => {
    try {
      // Call the sample milestones function
      const { error } = await supabase.rpc('create_sample_milestones', {
        user_id: user.id
      });
      
      if (error) {
        console.error('Failed to create sample data:', error);
      } else {
        await logBreadcrumb({
          scope: 'setup',
          summary: 'Created sample milestone data',
          tags: ['setup', 'milestones']
        });
        // Refresh counts
        runSelfTests();
      }
    } catch (error) {
      console.error('Error creating sample data:', error);
    }
  };
  
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Health Dashboard</h1>
          <p className="text-muted-foreground">DEV Environment Only</p>
        </div>
        <Badge variant="secondary">DEV MODE</Badge>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">Authenticated</Badge>
                <span className="text-sm text-muted-foreground">{user.email}</span>
              </div>
              <div className="text-xs text-muted-foreground">User ID: {user.id}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Data Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Milestones:</span>
                <Badge variant="outline">{milestonesCount ?? '?'}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Breadcrumbs:</span>
                <Badge variant="outline">{breadcrumbsCount ?? '?'}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Self-Tests</CardTitle>
          <CardDescription>
            Run comprehensive tests to validate system functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={runSelfTests} 
              disabled={running}
              size="sm"
            >
              {running ? 'Running Tests...' : 'Run Self-Tests'}
            </Button>
            <Button 
              onClick={createSampleData} 
              variant="outline"
              size="sm"
            >
              Create Sample Data
            </Button>
          </div>
          
          {testResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Test Results:</h4>
              {testResults.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">{result.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={result.passed ? "default" : "destructive"}>
                      {result.passed ? 'PASS' : 'FAIL'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{result.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Health;