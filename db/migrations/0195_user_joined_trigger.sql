-- Fan-out trigger: a new profiles row → activity (kind='user_joined').
-- A profile is created once per signup (the auth.users → profiles trigger),
-- so this fires exactly once per new member and surfaces in the site-wide
-- ("ALL") feed as "fresh meat. <username> scrambled into the pit."
--
-- No payload name is stored: the feed enriches the actor from profiles at
-- read time, so the username stays correct even though the profile row is
-- created before onboarding finalizes the handle.
--
-- Separate file from 0194 because ALTER TYPE … ADD VALUE must commit before
-- a function can reference the new value.

CREATE OR REPLACE FUNCTION public.activity_on_profile_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity (actor_user_id, kind, payload)
  VALUES (NEW.id, 'user_joined', '{}'::jsonb);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_profile_insert_emit_user_joined
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.activity_on_profile_insert();
