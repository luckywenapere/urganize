-- Role-based views (URG-260, founder-approved 2026-10-14).
--
-- The menu leads with what a person's "Who are you?" answer needs and tucks
-- the rest under "More" (apps/web/lib/role-views.ts). The view is worked out
-- from profiles.onboarding_persona, then profiles.role, so nothing needs
-- storing for it. This column holds only the Settings override: a person who
-- picks a different view in Settings > General > View.
--
-- Null means automatic (the default, and every existing row). Per user, not
-- per team: two people on one team can see the app differently.
-- User-writable under the existing profiles RLS (the BEFORE UPDATE guard
-- trigger only blocks trial and paid fields), like ask_after_tasks.
--
-- The app reads profiles with select('*'), so until this is applied the
-- column is simply absent and every account gets its automatic view; only
-- the Settings switch fails to save. Apply before switching
-- NEXT_PUBLIC_FEATURE_ROLE_VIEWS on.
--
-- ROLLBACK (manual, if ever needed):
--   alter table public.profiles drop constraint if exists profiles_role_view_check;
--   alter table public.profiles drop column if exists role_view;

alter table public.profiles
  add column if not exists role_view text null;

alter table public.profiles drop constraint if exists profiles_role_view_check;
alter table public.profiles add constraint profiles_role_view_check
  check (
    role_view is null
    or role_view in ('artist_manager', 'label', 'solo_artist', 'artist_team', 'other')
  );
