import React, { useEffect, useState } from 'react';
import EnvBadge from '@/components/EnvBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function Health() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);
  const [breadcrumbCount, setBreadcrumbCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const uid = user?.id ?? null;

  async function refreshCounts() {
    setLoading(true);
    try {
      const [{ count: mCount, error: mErr }, { count: bCount, error: bErr }] = await Promise.all([
        supabase.from('ledger_milestones').select('*', { count: 'exact', head: true }),
        supabase.from('dev_breadcrumbs').select('*', { count: 'exact', head: true })
      ]);
      if (mErr) throw mErr; if (bErr) throw bErr;
      setMilestoneCount(mCount ?? 0);
      setBreadcrumbCount(bCount ?? 0);
    } catch (e) {
      console.warn('[Health] count refresh failed', e);
      setMilestoneCount(null);
      setBreadcrumbCount(null);
    } finally {
      setLoading(false);
    }
  }

  async function seedSampleData() {
    if (!uid) return alert('Sign in first.');
    setSeeding(true);
    try {
      // Call the edge function to seed milestones
      const { data, error } = await supabase.functions.invoke('seed-milestones', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) throw error;

      // Log the seeding action in breadcrumbs
      const { error: bErr } = await supabase.from('dev_breadcrumbs').insert({
        owner_id: uid,
        scope: 'seed',
        summary: 'Seeded sample milestones via edge function',
        details: { by: 'Health.seedSampleData', response: data },
        tags: ['seed','health']
      });
      if (bErr) console.warn('Failed to log breadcrumb:', bErr);
      
      await refreshCounts();
      alert('Sample data created successfully!');
    } catch (e: any) {
      console.error(e);
      alert('Seeding failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setSeeding(false);
    }
  }

  async function runSelfTests() {
    if (!uid) return alert('Sign in first.');
    setRunning(true);
    try {
      // Minimal smoke tests: write two breadcrumbs and confirm no throw
      const write = async (summary: string, details: any) => {
        const { error } = await supabase.from('dev_breadcrumbs').insert({ 
          owner_id: uid, 
          scope: 'selftest', 
          summary, 
          details, 
          tags: ['selftest','health'] 
        });
        if (error) throw error;
      };
      await write('health_start', { t: Date.now() });
      await write('health_ok', { note: 'basic insert works' });
      await refreshCounts();
      alert('Self-tests ran without errors.');
    } catch (e: any) {
      console.error(e);
      alert('Self-tests failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { refreshCounts(); }, []);

  return (
    <div className="p-4 space-y-4">
      <EnvBadge />
      <h1 className="text-xl font-bold">Health Dashboard</h1>
      <p className="text-sm opacity-80">If you see ENV as DEV or PREVIEW above, /health should be allowed by AuthGate.</p>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Milestones</div>
          <div className="text-2xl font-semibold">{loading ? '…' : milestoneCount ?? '?'}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Breadcrumbs</div>
          <div className="text-2xl font-semibold">{loading ? '…' : breadcrumbCount ?? '?'}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm opacity-70">Auth</div>
          <div className="text-sm">{uid ? 'Authenticated' : 'Not signed in'}</div>
        </div>
      </section>

      <section className="flex gap-2">
        <button onClick={refreshCounts} className="px-3 py-2 border rounded">Refresh</button>
        <button disabled={seeding} onClick={seedSampleData} className="px-3 py-2 border rounded">{seeding ? 'Seeding…' : 'Create Sample Data'}</button>
        <button disabled={running} onClick={runSelfTests} className="px-3 py-2 border rounded">{running ? 'Running…' : 'Run Self-Tests'}</button>
      </section>
    </div>
  );
}