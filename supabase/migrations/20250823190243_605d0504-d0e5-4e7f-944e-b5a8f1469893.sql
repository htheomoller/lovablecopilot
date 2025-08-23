-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create ledger_milestones table
CREATE TABLE public.ledger_milestones (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date DATE,
  duration_days INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create dev_breadcrumbs table
CREATE TABLE public.dev_breadcrumbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scope TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_breadcrumbs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- RLS Policies for ledger_milestones
CREATE POLICY "Users can view own milestones" ON public.ledger_milestones
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own milestones" ON public.ledger_milestones
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own milestones" ON public.ledger_milestones
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own milestones" ON public.ledger_milestones
  FOR DELETE USING (owner_id = auth.uid());

-- RLS Policies for dev_breadcrumbs
CREATE POLICY "Users can view own breadcrumbs" ON public.dev_breadcrumbs
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own breadcrumbs" ON public.dev_breadcrumbs
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own breadcrumbs" ON public.dev_breadcrumbs
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own breadcrumbs" ON public.dev_breadcrumbs
  FOR DELETE USING (owner_id = auth.uid());

-- Insert sample milestone data function
CREATE OR REPLACE FUNCTION public.create_sample_milestones(user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ledger_milestones (id, project, name, start_date, duration_days, status, owner_id)
  VALUES 
    ('m1-setup', 'CoPilot', 'M1: Setup & Ledger', CURRENT_DATE, 7, 'in_progress', user_id),
    ('m2-core', 'CoPilot', 'M2: Core Features', CURRENT_DATE + INTERVAL '7 days', 14, 'pending', user_id),
    ('m3-polish', 'CoPilot', 'M3: Polish & Deploy', CURRENT_DATE + INTERVAL '21 days', 10, 'pending', user_id)
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;