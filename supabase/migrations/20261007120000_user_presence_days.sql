-- Last seen, one row per person per day (2026-10-07).
--
-- Until this, nothing recorded someone opening the app and looking around.
-- Every "active" number (the admin scoreboard included) counted writes only,
-- so a manager who checked their rollouts and left was invisible, which is
-- exactly the retention question the founder wants answered.
--
-- The app sends a small ping every couple of minutes while a tab is visible
-- (components/app/PresenceBeacon.tsx -> POST /api/presence). Each ping upserts
-- the row for (person, Lagos calendar day), so the table grows by at most one
-- row per person per day however long they stay.
--
-- Read by /admin/metrics only: who is online now (last_seen_at within five
-- minutes) and daily / weekly / monthly active people.
--
-- RLS on with no policies: the ping route and the admin route both use the
-- service role, and nobody reads anyone's presence from the browser. Rows go
-- with the account (cascade from auth.users) and are part of the account data
-- export.

create table if not exists public.user_presence_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  surface text not null default 'desktop_web',
  constraint user_presence_days_pkey primary key (user_id, day),
  constraint user_presence_days_surface_check check (
    surface in ('desktop_web', 'phone_web', 'installed', 'android_app', 'ios_app')
  )
);

create index if not exists user_presence_days_last_seen_idx
  on public.user_presence_days (last_seen_at desc);

alter table public.user_presence_days enable row level security;
