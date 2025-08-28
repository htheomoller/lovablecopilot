-- First create the missing profile for the current user if it doesn't exist
INSERT INTO public.profiles (id, email, name, created_at)
SELECT 
  '46bbb943-6903-4a09-b70f-1ad5aacfe921'::uuid,
  'htheomoller@gmail.com',
  'htheomoller@gmail.com',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE id = '46bbb943-6903-4a09-b70f-1ad5aacfe921'::uuid
);

-- Update the handle_new_user function to properly handle GitHub OAuth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    created_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name', 
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'user_name',
      NEW.email
    ),
    NEW.created_at
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(
      NEW.raw_user_meta_data->>'full_name', 
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'user_name',
      profiles.name,
      NEW.email
    );
  RETURN NEW;
END;
$function$;