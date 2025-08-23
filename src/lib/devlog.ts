import { supabase } from './supabase';

interface BreadcrumbData {
  scope: string;
  summary: string;
  details?: Record<string, any>;
  tags?: string[];
}

export const logBreadcrumb = async (data: BreadcrumbData): Promise<void> => {
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
  
  // No-op in production
  if (!isDev) {
    return;
  }
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('Cannot log breadcrumb: user not authenticated');
      return;
    }
    
    const { error } = await supabase
      .from('dev_breadcrumbs')
      .insert({
        owner_id: user.id,
        scope: data.scope,
        summary: data.summary,
        details: data.details || null,
        tags: data.tags || null,
      });
    
    if (error) {
      console.error('Failed to log breadcrumb:', error);
    }
  } catch (err) {
    console.error('Error logging breadcrumb:', err);
  }
};

export const getBreadcrumbs = async (limit = 10) => {
  const { data, error } = await supabase
    .from('dev_breadcrumbs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) {
    throw error;
  }
  
  return data;
};