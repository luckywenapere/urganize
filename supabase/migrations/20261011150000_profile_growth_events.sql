-- Profile growth loop: the three counts the admin funnel cannot read from any
-- other table (2026-10-11).
--
-- ADDITIVE AND IDEMPOTENT. One new table, nothing else touched, re-running it
-- changes nothing. Safe in either order with the code: before it is applied
-- the server's inserts fail, are logged and are ignored (the page and the
-- redirect are unaffected), and /admin/profile-funnel shows those three steps
-- as "Not tracked".
--
-- What a row is:
--   profile_view  somebody (not a link preview, not a prefetch) read /p/{slug}
--   cta_click     somebody tapped "Get your own page" or "Run your rollouts"
--   signup        a new account that arrived from a profile or a claim link
--
-- COUNTS ONLY. No IP, no user agent, no slug, no name. person_id says which
-- page, user_id is set only on a signup row (the new account itself, so the
-- funnel can leave our own accounts out). The PostHog events carry the same
-- facts for anything deeper.
--
-- RLS on with NO policies: written and read by the service role only (the
-- public routes and the admin route), never by a signed-in client.
--
-- ROLLBACK (manual):
--   drop table if exists public.profile_growth_events;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.profile_growth_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    constraint profile_growth_events_kind_check
    check (kind in ('profile_view', 'cta_click', 'signup')),
  person_id uuid references public.person_profiles(id) on delete set null,
  cta text
    constraint profile_growth_events_cta_check
    check (cta is null or cta in ('collaborator', 'manager')),
  source text
    constraint profile_growth_events_source_check
    check (source is null or source in ('profile', 'claim')),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Only a signup row names an account, and it must.
  constraint profile_growth_events_user_check
    check ((kind = 'signup') = (user_id is not null))
);

-- The funnel reads the last 30 days by kind.
create index if not exists profile_growth_events_kind_time_idx
  on public.profile_growth_events(kind, created_at desc);

-- One signup row per account, ever: a second report is a no-op (23505).
create unique index if not exists profile_growth_events_signup_key
  on public.profile_growth_events(user_id)
  where kind = 'signup';

alter table public.profile_growth_events enable row level security;
-- No policies on purpose. Service role only.
