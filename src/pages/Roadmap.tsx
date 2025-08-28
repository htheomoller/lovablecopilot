import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/AppLayout';
import { logBreadcrumb } from '@/lib/devlog';

interface Milestone {
  id: string;
  project: string;
  name: string;
  start_date: string | null;
  duration_days: number;
  status: string;
  created_at: string;
}

const Roadmap = () => {
  const { user, loading } = useAuth();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  
  useEffect(() => {
    if (user) {
      loadMilestones();
    }
  }, [user]);
  
  const loadMilestones = async () => {
    try {
      const { data, error } = await supabase
        .from('ledger_milestones')
        .select('*')
        .order('start_date', { ascending: true });
      
      if (error) {
        console.error('Failed to load milestones:', error);
        await logBreadcrumb({
          scope: 'roadmap',
          summary: 'Failed to load milestones',
          details: { error: error.message },
          tags: ['error', 'roadmap']
        });
      } else {
        setMilestones(data || []);
        await logBreadcrumb({
          scope: 'roadmap',
          summary: `Loaded ${data?.length || 0} milestones`,
          tags: ['roadmap', 'data']
        });
      }
    } catch (error) {
      console.error('Error loading milestones:', error);
    } finally {
      setLoadingData(false);
    }
  };
  
  if (loading || loadingData) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to view your roadmap</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in_progress': return 'secondary';
      case 'pending': return 'outline';
      default: return 'outline';
    }
  };
  
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleDateString();
  };
  
  return (
    <AppLayout>
      <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Project Roadmap</h1>
        <p className="text-muted-foreground">Track milestone progress and timeline</p>
      </div>
      
      {milestones.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Milestones Found</CardTitle>
            <CardDescription>
              No milestones have been created yet. Visit the Health page to create sample data.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {milestones.map((milestone) => (
            <Card key={milestone.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{milestone.name}</CardTitle>
                  <Badge variant={getStatusColor(milestone.status)}>
                    {milestone.status.replace('_', ' ')}
                  </Badge>
                </div>
                <CardDescription>{milestone.project}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Date:</span>
                    <span>{formatDate(milestone.start_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span>{milestone.duration_days} days</span>
                  </div>
                  {milestone.start_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">End Date:</span>
                      <span>
                        {formatDate(
                          new Date(
                            new Date(milestone.start_date).getTime() + 
                            milestone.duration_days * 24 * 60 * 60 * 1000
                          ).toISOString()
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
         </div>
       )}
     </div>
   </AppLayout>
 );
};

export default Roadmap;