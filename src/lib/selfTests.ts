import { supabase } from '@/integrations/supabase/client';
import { logBreadcrumb, getBreadcrumbs } from './devlog';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

export const testAuth = async (): Promise<TestResult> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      return {
        name: 'Auth Test',
        passed: false,
        message: `Auth error: ${error.message}`,
        details: error
      };
    }
    
    if (!user) {
      return {
        name: 'Auth Test',
        passed: false,
        message: 'No authenticated user found'
      };
    }
    
    return {
      name: 'Auth Test',
      passed: true,
      message: `User authenticated: ${user.email}`,
      details: { userId: user.id, email: user.email }
    };
  } catch (err) {
    return {
      name: 'Auth Test',
      passed: false,
      message: `Unexpected error: ${err}`,
      details: err
    };
  }
};

export const testRlsBreadcrumb = async (): Promise<TestResult> => {
  try {
    // Insert a test breadcrumb
    await logBreadcrumb({
      scope: 'self-test',
      summary: 'Test breadcrumb insertion',
      details: { timestamp: Date.now() },
      tags: ['test', 'rls']
    });
    
    // Try to read it back
    const breadcrumbs = await getBreadcrumbs(1);
    
    if (breadcrumbs.length === 0) {
      return {
        name: 'RLS Breadcrumb Test',
        passed: false,
        message: 'No breadcrumbs found after insert'
      };
    }
    
    return {
      name: 'RLS Breadcrumb Test',
      passed: true,
      message: `Successfully inserted and retrieved breadcrumb`,
      details: { breadcrumbId: breadcrumbs[0].id }
    };
  } catch (err) {
    return {
      name: 'RLS Breadcrumb Test',
      passed: false,
      message: `Breadcrumb test failed: ${err}`,
      details: err
    };
  }
};

export const testLedgerRead = async (): Promise<TestResult> => {
  try {
    const { data, error } = await supabase
      .from('ledger_milestones')
      .select('*');
    
    if (error) {
      return {
        name: 'Ledger Read Test',
        passed: false,
        message: `Failed to read milestones: ${error.message}`,
        details: error
      };
    }
    
    return {
      name: 'Ledger Read Test',
      passed: true,
      message: `Successfully read ${data.length} milestones`,
      details: { count: data.length }
    };
  } catch (err) {
    return {
      name: 'Ledger Read Test',
      passed: false,
      message: `Unexpected error: ${err}`,
      details: err
    };
  }
};

export const testProfileUpsert = async (): Promise<TestResult> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return {
        name: 'Profile Upsert Test',
        passed: false,
        message: 'No authenticated user for profile test'
      };
    }
    
    // Upsert user profile
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email || 'test@example.com',
        name: user.user_metadata?.name || 'Test User',
      })
      .select()
      .single();
    
    if (error) {
      return {
        name: 'Profile Upsert Test',
        passed: false,
        message: `Profile upsert failed: ${error.message}`,
        details: error
      };
    }
    
    return {
      name: 'Profile Upsert Test',
      passed: true,
      message: 'Profile upserted successfully',
      details: { profileId: data?.id }
    };
  } catch (err) {
    return {
      name: 'Profile Upsert Test',
      passed: false,
      message: `Unexpected error: ${err}`,
      details: err
    };
  }
};

export const runAllTests = async (): Promise<TestResult[]> => {
  const tests = [
    testAuth,
    testProfileUpsert,
    testRlsBreadcrumb,
    testLedgerRead
  ];
  
  const results = await Promise.all(tests.map(test => test()));
  
  // Log test summary
  await logBreadcrumb({
    scope: 'self-tests',
    summary: `Ran ${tests.length} tests: ${results.filter(r => r.passed).length} passed`,
    details: { results },
    tags: ['tests', 'health-check']
  });
  
  return results;
};