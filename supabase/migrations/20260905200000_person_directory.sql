-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- URGANIZE DIRECTORY, PHASE 1 (2026-09-05)
--
-- A record of the people who do the work on a release. Managers search for
-- someone who has delivered the role their rollout needs; professionals opt in
-- and their record is built from work Urganize already logged.
--
-- Sits UNDERNEATH press_kits rather than beside it. A kit belongs to an ARTIST
-- and is one public page per artist; this is a person layer, one row per user,
-- and most of the people in it are not artists.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIONS WORTH KNOWING BEFORE CHANGING ANY OF THIS
--
-- 1. delivery_records IS DERIVED AND HAS NO WRITE PATH FROM THE UI. There is no
--    insert, update or delete policy on it at all, for any role, and that is
--    the feature rather than an oversight: the moment a person can type "mixed
--    40 records" the whole asset is worthless. Rows are computed by
--    lib/delivery-records.ts and written by the service role only.
--
-- 2. THIS IS THE SECOND CROSS-TENANT READ IN THE SCHEMA. The first was
--    playlist_pitches. A directory means a signed-in user in team A reads a row
--    owned by a user in team B, so person_profiles carries TWO select policies:
--    your own row whatever its visibility, and anybody else's row only once
--    they have opted in. Splitting them keeps each a flat comparison instead of
--    one policy doing two jobs.
--
-- 3. delivery_records HAS NO SELECT POLICY FOR OTHER PEOPLE, deliberately.
--    Section 10 of the brief allows a release TITLE to be network-visible only
--    where that release is public, and RLS cannot see that rule: it depends on
--    the kit's visibility, the release's delivered state and which fields the
--    caller asked for. Serving another person's records is therefore a
--    service-role read behind an API route that applies the rule in one place,
--    the same posture the public press kit page takes. Your own records you can
--    always read.
--
-- 4. RECORDS OUTLIVE MEMBERSHIP (founder call). Leaving a team does not erase
--    what you delivered, so there is no workspace_id on delivery_records and
--    nothing cascades from workspace_members. They die with the USER (their own
--    account) or with the RELEASE, and nothing else.
--
-- 5. ONE ROW PER PERSON PER ROLE PER RELEASE, enforced by a unique index rather
--    than left to the writer. A designer who delivered a draft and then the
--    final artwork delivered ONE release's artwork; two rows would read as two
--    releases, and the count is the entire product.
--
-- 6. `role` IS A CHECK, NOT A POSTGRES ENUM. The vocabulary is product copy and
--    will change, and `alter type ... add value` cannot run inside a
--    transaction. Same reasoning as press_kit_sections.section.
--
-- ROLLBACK (manual, children first):
--   drop table if exists public.delivery_records;
--   drop table if exists public.person_profiles;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.person_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null
    constraint person_profiles_display_name_check
    check (char_length(btrim(display_name)) between 1 and 80),

  -- Its own namespace, served at /p/{slug}. press_kits.slug is unique within
  -- its own table at /k/{slug}, so the two cannot collide unless somebody
  -- deliberately serves both from one prefix. Same shape rule so a person and
  -- an artist cannot have differently spelled handles.
  slug text
    constraint person_profiles_slug_shape_check
    check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60)),

  roles text[] not null default '{}',
  city text,
  country text,

  availability text not null default 'selective'
    constraint person_profiles_availability_check
    check (availability in ('open', 'selective', 'closed')),

  bio text
    constraint person_profiles_bio_check
    check (bio is null or char_length(bio) <= 600),
  links jsonb not null default '[]'::jsonb,
  avatar_storage_path text,
  avatar_file_name text,

  -- Default private. NOBODY is listed without opting in, which is why this
  -- column has a default rather than being set by the first writer.
  --   private   - nobody but you
  --   directory - signed-in users can find you in the directory
  --   public    - the profile page is readable without signing in
  visibility text not null default 'private'
    constraint person_profiles_visibility_check
    check (visibility in ('private', 'directory', 'public')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One profile per person. Also the upsert target when opt in creates it lazily.
create unique index if not exists person_profiles_user_id_key
  on public.person_profiles(user_id);

-- Partial, because a profile that has never been given a handle holds null and
-- many nulls must not collide.
create unique index if not exists person_profiles_slug_key
  on public.person_profiles(slug)
  where slug is not null;

-- The directory's list query: everyone who has opted in, newest first.
create index if not exists person_profiles_visibility_idx
  on public.person_profiles(visibility, updated_at desc)
  where visibility <> 'private';

create table if not exists public.delivery_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  role text not null
    constraint delivery_records_role_check
    check (role in (
      'manager', 'a_and_r', 'producer', 'mix_engineer', 'master_engineer',
      'songwriter', 'videographer', 'video_director', 'photographer',
      'graphic_designer', 'pr', 'digital_marketer', 'playlist_curator',
      'booking_agent', 'tour_manager', 'distributor'
    )),

  -- Exactly one of these. A record is evidence of a specific piece of work, so
  -- one that names neither is not evidence of anything. Shows verify the same
  -- way a release does once the date has passed, which is why the column is
  -- here in phase 1 even though nothing writes it yet.
  release_id uuid references public.releases(id) on delete cascade,
  show_id uuid references public.events(id) on delete cascade,
  constraint delivery_records_scope_check
    check (num_nonnulls(release_id, show_id) = 1),

  -- Often null, and that is expected rather than a data problem: the checkbox
  -- completion path sets status without stamping tasks.completed_at. Useful for
  -- ordering, never for filtering.
  completed_at timestamptz,

  -- Recomputed rather than trusted. Kept so a future rule change can be told
  -- apart from a row written under the old one.
  computed_at timestamptz not null default now(),

  created_at timestamptz not null default now()
);

-- Decision 5, enforced by the database rather than by whoever writes next.
-- Two partial indexes because a null never equals a null, so one index over
-- both columns would let duplicates through.
create unique index if not exists delivery_records_release_key
  on public.delivery_records(user_id, role, release_id)
  where release_id is not null;

create unique index if not exists delivery_records_show_key
  on public.delivery_records(user_id, role, show_id)
  where show_id is not null;

-- The profile page's own query: everything this person has delivered.
create index if not exists delivery_records_user_idx
  on public.delivery_records(user_id, role);

alter table public.person_profiles enable row level security;
alter table public.delivery_records enable row level security;

-- Your own profile, whatever its visibility, including while it is private.
drop policy if exists "Users manage their own person profile" on public.person_profiles;
create policy "Users manage their own person profile"
  on public.person_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Decision 2: the cross-tenant read. A signed-in user sees somebody else's
-- profile only once that person has opted in. No team, workspace or membership
-- appears in this comparison, because the directory is deliberately not scoped
-- to a team.
drop policy if exists "Signed-in users read opted-in profiles" on public.person_profiles;
create policy "Signed-in users read opted-in profiles"
  on public.person_profiles for select
  using (auth.uid() is not null and visibility <> 'private');

-- Decision 1 and 3: you may read your own record and nothing else, and nobody
-- may write one from the client at all.
drop policy if exists "Users read their own delivery records" on public.delivery_records;
create policy "Users read their own delivery records"
  on public.delivery_records for select
  using (auth.uid() = user_id);

drop trigger if exists set_person_profiles_updated_at on public.person_profiles;
create trigger set_person_profiles_updated_at
  before update on public.person_profiles
  for each row execute function public.set_updated_at();

-- The role vocabulary lives in lib/directory-roles.ts and is duplicated in the
-- CHECK above. They must move together; lib/directory-schema-guard.test.ts
-- fails the build if they drift.
