-- Short links (go.urganize.app/tt, /ig, /x ...): taps and sign-ups, kept in our
-- own database so /admin/source-links can show them (2026-11-27, #1409).
--
-- Until now the two events went to PostHog only (docs/notes/2026-11-10-source-links.md),
-- so there was nothing for an admin page to read.
--
-- ADDITIVE AND IDEMPOTENT. One new table and one read-only function, nothing
-- else touched, re-running it changes nothing. Safe in either order with the
-- code: before it is applied the server's inserts fail, are logged and are
-- ignored (the redirect and the sign-up are unaffected), and the admin page
-- says the numbers are not tracked yet.
--
-- What a row is:
--   tap     somebody (not a link preview, not a prefetch) opened a short link
--   signup  a new account whose browser still carried that link's cookie
--
-- COUNTS ONLY. A tap is the link and the time: no IP, no user agent, no person.
-- user_id is set only on a signup row (the new account itself, so the page can
-- leave our own accounts out and say what those people went on to do).
--
-- slug is the short name in the address (tt, ig, x). It is checked against the
-- list in apps/web/lib/source-links.json before it is written; the check here
-- only keeps the column to that shape.
--
-- RLS on with NO policies: written and read by the service role only (the go
-- route, the sign-up route and the admin route), never by a signed-in client.
--
-- ROLLBACK (manual):
--   drop function if exists public.source_link_tap_counts(timestamptz, timestamptz);
--   drop table if exists public.source_link_events;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.source_link_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    constraint source_link_events_kind_check
    check (kind in ('tap', 'signup')),
  slug text not null
    constraint source_link_events_slug_check
    check (slug ~ '^[a-z0-9]{1,12}$'),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Only a signup row names an account, and it must.
  constraint source_link_events_user_check
    check ((kind = 'signup') = (user_id is not null))
);

-- The page reads by kind, newest first, and counts by slug.
create index if not exists source_link_events_kind_time_idx
  on public.source_link_events(kind, created_at desc);
create index if not exists source_link_events_kind_slug_time_idx
  on public.source_link_events(kind, slug, created_at desc);

-- One signup row per account, ever: a second report is a no-op (23505).
create unique index if not exists source_link_events_signup_key
  on public.source_link_events(user_id)
  where kind = 'signup';

alter table public.source_link_events enable row level security;
-- No policies on purpose. Service role only.

-- Taps per link, counted in the database. The admin route cannot read tap rows
-- and count them itself: the API returns 1,000 rows at most, and taps pass
-- that quickly. Sign-ups are few and are read as rows (our own accounts have
-- to be left out by email, which this function cannot know).
--
-- p_this_week and p_last_week are the Monday 00:00 (Lagos) that starts each
-- week, passed in by the caller so the week rule lives in one place.
create or replace function public.source_link_tap_counts(
  p_this_week timestamptz,
  p_last_week timestamptz
)
returns table (
  slug text,
  total bigint,
  this_week bigint,
  last_week bigint,
  first_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    e.slug,
    count(*) as total,
    count(*) filter (where e.created_at >= p_this_week) as this_week,
    count(*) filter (where e.created_at >= p_last_week and e.created_at < p_this_week) as last_week,
    min(e.created_at) as first_at
  from public.source_link_events e
  where e.kind = 'tap'
  group by e.slug;
$$;

-- Runs as the caller, so RLS already hides the rows from a signed-in client.
-- Taking execute away as well keeps the function itself off the public API.
revoke all on function public.source_link_tap_counts(timestamptz, timestamptz) from public;
revoke all on function public.source_link_tap_counts(timestamptz, timestamptz) from anon;
revoke all on function public.source_link_tap_counts(timestamptz, timestamptz) from authenticated;
grant execute on function public.source_link_tap_counts(timestamptz, timestamptz) to service_role;
