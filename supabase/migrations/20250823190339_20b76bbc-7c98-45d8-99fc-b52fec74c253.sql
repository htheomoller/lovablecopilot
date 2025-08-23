-- Fix the function search path security issue
CREATE OR REPLACE FUNCTION public.create_sample_milestones(user_id UUID)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ledger_milestones (id, project, name, start_date, duration_days, status, owner_id)
  VALUES 
    ('m1-setup', 'CoPilot', 'M1: Setup & Ledger', CURRENT_DATE, 7, 'in_progress', user_id),
    ('m2-core', 'CoPilot', 'M2: Core Features', CURRENT_DATE + INTERVAL '7 days', 14, 'pending', user_id),
    ('m3-polish', 'CoPilot', 'M3: Polish & Deploy', CURRENT_DATE + INTERVAL '21 days', 10, 'pending', user_id)
  ON CONFLICT (id) DO NOTHING;
END;
$$;