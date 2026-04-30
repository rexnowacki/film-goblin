-- 0138: track whether a profile has a real email attached.
--
-- Sub-project 21 makes signup username-only. We generate a synthetic
-- <username>@noreply.film-goblin.app email under the hood (Supabase auth
-- requires an email column on auth.users), but we don't want to send
-- email notifications to that address. profiles.email_added_at is NULL
-- when the user has only the synthetic noreply email; it gets set to
-- now() once they add a real email from /settings (and Supabase confirms
-- the change via its own email-confirmation flow).
--
-- Backfill: every existing profile signed up under the old email-required
-- flow, so they all have real emails. Stamp email_added_at = created_at
-- so they're immediately eligible for email notifications.
--
-- Trigger: on auth.users email change, if the new email is NOT in the
-- @noreply.film-goblin.app domain, set email_added_at = now() (idempotent).
-- Lets users update their email later and keep the flag set.
--
-- Notifier candidate query gets `AND email_added_at IS NOT NULL` added in
-- the same PR so we never blast the synthetic noreply domain.

ALTER TABLE profiles ADD COLUMN email_added_at TIMESTAMPTZ NULL;

UPDATE profiles SET email_added_at = created_at WHERE email_added_at IS NULL;

CREATE OR REPLACE FUNCTION public.handle_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL
     AND NEW.email <> OLD.email
     AND NEW.email NOT LIKE '%@noreply.film-goblin.app' THEN
    UPDATE public.profiles
       SET email_added_at = COALESCE(email_added_at, now())
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_change ON auth.users;
CREATE TRIGGER on_auth_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_change();
