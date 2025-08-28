-- Add GitHub integration fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS github_access_token TEXT,
ADD COLUMN IF NOT EXISTS github_username TEXT,
ADD COLUMN IF NOT EXISTS connected_repositories JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_github_sync TIMESTAMP WITH TIME ZONE;

-- Create an index for faster GitHub username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_github_username ON public.profiles(github_username);

-- Create a table for storing repository audit data
CREATE TABLE IF NOT EXISTS public.repository_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  repository_name TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  last_audit_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  audit_status TEXT DEFAULT 'pending' CHECK (audit_status IN ('pending', 'completed', 'failed')),
  audit_results JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on repository_audits table
ALTER TABLE public.repository_audits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for repository_audits
CREATE POLICY "Users can view their own repository audits" 
ON public.repository_audits 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own repository audits" 
ON public.repository_audits 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own repository audits" 
ON public.repository_audits 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own repository audits" 
ON public.repository_audits 
FOR DELETE 
USING (user_id = auth.uid());

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_repository_audits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_repository_audits_updated_at
    BEFORE UPDATE ON public.repository_audits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_repository_audits_updated_at();