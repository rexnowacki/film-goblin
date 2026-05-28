-- 0192_site_settings.sql
-- Generic key-value store for runtime-mutable, site-wide settings.
-- First setting: invite_gate (replaces the INVITE_GATE env var).
-- Access is service-role only: RLS is enabled with NO policies, matching the
-- lockdown style of mig 0189. The signup gate read and the admin toggle both
-- go through the service-role client.

create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.site_settings enable row level security;

-- Seed the invite gate ON so production behavior is unchanged at deploy time.
insert into public.site_settings (key, value)
values ('invite_gate', 'true'::jsonb)
on conflict (key) do nothing;
