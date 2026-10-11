-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- FEATURED, NOT RANKED (2026-10-10)
--
-- Two shelves above the directory's search. Search results are never ranked;
-- a shelf is something the product says out loud.
--
--   featured_profiles  Picked by hand by Urganize, up to six per role, one
--                      quarter each. Only a published profile can be shelved.
--   on_the_rise_picks  Computed once a month from real delivered work by a
--                      daily-cron passenger (lib/featured-shelves.ts).
--
-- DECISIONS WORTH KNOWING BEFORE CHANGING THIS
--
-- 1. NOTHING HERE CAN BE BOUGHT. There is no price, plan, order or payment
--    column, and no route that takes money. The shelf is editorial.
--
-- 2. "PUBLISHED" IS ENFORCED IN THE DATABASE, not only in the admin route. A
--    before-insert trigger refuses a profile that is not claimed and listed,
--    and refuses a seventh person for a role in the same quarter, so a second
--    writer (a script, a later route) cannot get around either rule. The read
--    path ALSO filters on published at read time, because a person can go
--    private after being picked and a shelf must never show them then. If
--    profiles gain an explicit publish step, change the trigger and
--    isPublishedProfile in lib/featured-shelves.ts together.
--
-- 3. THE CAP IS PER ROLE PER QUARTER, counted on identical starts_at. A quarter
--    is exactly one window, so rows for the same quarter share starts_at.
--
-- 4. RLS: signed-in users can READ both tables (the directory page shows
--    them); every write is a service-role route behind the admin check, or the
--    cron. Both tables hold profile ids and roles only, nothing private.
--
-- 5. role is a CHECK, not an enum, the same vocabulary as delivery_records.
--
-- ROLLBACK (manual):
--   drop table if exists public.on_the_rise_picks;
--   drop table if exists public.featured_profiles;
--   drop function if exists public.featured_profiles_guard();
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.featured_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.person_profiles(id) on delete cascade,
  role text not null
    constraint featured_profiles_role_check
    check (role in (
      'manager', 'a_and_r', 'producer', 'mix_engineer', 'master_engineer',
      'songwriter', 'videographer', 'video_director', 'photographer',
      'graphic_designer', 'pr', 'digital_marketer', 'playlist_curator',
      'booking_agent', 'tour_manager', 'distributor'
    )),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint featured_profiles_window_check check (ends_at > starts_at)
);

-- One pick per person per role per quarter.
create unique index if not exists featured_profiles_pick_key
  on public.featured_profiles(profile_id, role, starts_at);

-- The shelf's read: what is live right now.
create index if not exists featured_profiles_window_idx
  on public.featured_profiles(starts_at, ends_at);

create or replace function public.featured_profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.person_profiles p
    where p.id = new.profile_id
      and p.user_id is not null
      and p.status = 'claimed'
      and p.visibility <> 'private'
  ) then
    raise exception 'featured_profile_not_published'
      using errcode = '23514',
            detail = 'Only a claimed, listed profile can be featured.';
  end if;

  if (
    select count(*)
    from public.featured_profiles f
    where f.role = new.role
      and f.starts_at = new.starts_at
      and f.id <> new.id
  ) >= 6 then
    raise exception 'featured_role_full'
      using errcode = '23514',
            detail = 'A role can have six featured profiles per quarter.';
  end if;

  return new;
end;
$$;

drop trigger if exists featured_profiles_guard_trigger on public.featured_profiles;
create trigger featured_profiles_guard_trigger
  before insert on public.featured_profiles
  for each row execute function public.featured_profiles_guard();

alter table public.featured_profiles enable row level security;

drop policy if exists featured_profiles_select on public.featured_profiles;
create policy featured_profiles_select
  on public.featured_profiles
  for select
  to authenticated
  using (true);

create table if not exists public.on_the_rise_picks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.person_profiles(id) on delete cascade,
  role text not null
    constraint on_the_rise_picks_role_check
    check (role in (
      'manager', 'a_and_r', 'producer', 'mix_engineer', 'master_engineer',
      'songwriter', 'videographer', 'video_director', 'photographer',
      'graphic_designer', 'pr', 'digital_marketer', 'playlist_curator',
      'booking_agent', 'tour_manager', 'distributor'
    )),
  -- The first of the Lagos month the pick is for, "2026-11-01".
  month date not null,
  computed_at timestamptz not null default now()
);

create unique index if not exists on_the_rise_picks_pick_key
  on public.on_the_rise_picks(profile_id, role, month);

create index if not exists on_the_rise_picks_month_idx
  on public.on_the_rise_picks(month);

alter table public.on_the_rise_picks enable row level security;

drop policy if exists on_the_rise_picks_select on public.on_the_rise_picks;
create policy on_the_rise_picks_select
  on public.on_the_rise_picks
  for select
  to authenticated
  using (true);
