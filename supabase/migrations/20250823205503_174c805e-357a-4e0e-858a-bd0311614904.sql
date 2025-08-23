-- Create lightweight key-value store for onboarding answers
create table if not exists public.project_guidelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  k text not null,
  v jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Simple RLS: owner-only
alter table public.project_guidelines enable row level security;

-- Drop existing policies if they exist
drop policy if exists "owner can read" on public.project_guidelines;
drop policy if exists "owner can insert" on public.project_guidelines;
drop policy if exists "owner can update" on public.project_guidelines;

-- Create new policies
create policy "owner can read" on public.project_guidelines for select using ( auth.uid() = user_id );
create policy "owner can insert" on public.project_guidelines for insert with check ( auth.uid() = user_id );
create policy "owner can update" on public.project_guidelines for update using ( auth.uid() = user_id );