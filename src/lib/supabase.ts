import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://yjfqfnmrsdfbvlyursdi.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZnFmbW1yc2RmYnZseXVyc2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5Mjk2MDQsImV4cCI6MjA3MTUwNTYwNH0.gPkkIglRw7yz7z-XWB0ZOTfWb9jlOZkt_2wCRT4q_gQ";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});