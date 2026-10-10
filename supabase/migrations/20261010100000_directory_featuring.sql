-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- DIRECTORY SPEC, STEP 2: FEATURED AND ON THE RISE, A FULLER REQUEST, AND
-- ACCEPT-STARTS-A-ROLLOUT (2026-10-10)
--
-- From Urganize_Profiles_and_Directory_Spec.docx (Oct 9, 2026), sections 6 and
-- 7. Step 1 (requests close after 7 days, "Not taking work" enforced, the reply
-- rate) shipped as 20261009130000_work_requests_expired.sql and PR #775. This is
-- the second step: the two shelves at the top of the directory, the three
-- things a request carries beyond its note, and what saying yes starts.
--
-- ADDITIVE AND SAFE TO RE-RUN. Nothing is rewritten and nothing is deleted. The
-- app does not wait for this migration: the inbox and the directory read fall
-- back to the old columns when a new one is missing (Postgres 42703), a plain
-- request still sends without any of the new columns, and every new table is
-- read through code that treats "table missing" as "empty shelf". What needs the
-- migration is only the new behaviour itself.
--
-- FOUR DECISIONS WORTH KNOWING BEFORE CHANGING ANY OF THIS
--
-- 1. THE RECIPIENT STILL NEVER SEES release_id. `next_release` is a line of text
--    the sender chose to write about what they are putting out, which is what
--    lets the recipient see it without breaking the rule the table is shaped
--    around. The new columns are added to the recipient's allowed list in code
--    (RECIPIENT_REQUEST_FIELDS) and shared_release_id is not: it is a sender-side
--    fact, set only after a yes, and it names a rollout.
--
-- 2. A HIRE DOES NOT TAKE A SEAT. workspace_members.is_hire marks a member who
--    joined because they said yes to a request, and countTeamSeats leaves them
--    out of the count. Seats are what a plan sells and Solo has one, so without
--    this a Solo manager could never hire anybody and the loop the spec is built
--    on (every connection ends in a shared rollout) would not run. A hire is
--    scoped to one artist (artist_scope_id, which already exists) and a team may
--    have ten at most (MAX_HIRES_PER_TEAM, enforced in code). Reversible with
--    one change: stop excluding the column in countTeamSeats.
--
-- 3. NO POLICY FOR ANY CLIENT ON THE TWO NEW TABLES. Featuring is Urganize's
--    to give ("Featured spots go to published profiles only", the founder signs
--    off), and On the rise is computed by a sweep. Neither can be written by a
--    signed-in person, so both have row level security on and NO policy at all:
--    every read and write is a service-role route. A `for all` policy here would
--    let anybody feature themselves.
--
-- 4. ON THE RISE IS A SNAPSHOT, NOT A QUERY. The spec says it "refreshes
--    monthly", and a shelf that quietly reshuffles whenever somebody finishes a
--    task is a ranking by another name. directory_rising holds one set per
--    month, written once by the daily sweep (lib/directory-featuring-server.ts).
--
-- ROLLBACK (manual):
--   drop table if exists public.directory_rising;
--   drop table if exists public.directory_featured;
--   alter table public.workspace_members drop column if exists is_hire;
--   alter table public.work_requests
--     drop column if exists started_at, drop column if exists shared_release_id,
--     drop column if exists task_id, drop column if exists links,
--     drop column if exists next_release;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 1. What a request carries -----------------------------------------------------

alter table public.work_requests
  -- "Next release" from the spec: a short line the sender typed, never an id.
  add column if not exists next_release text
    constraint work_requests_next_release_check
    check (next_release is null or char_length(btrim(next_release)) between 1 and 120),
  -- Up to three links (a demo, a past release, a page), as a json array of
  -- strings. Validated to http and https by lib/work-requests.ts before it gets
  -- here; the database only holds the shape and the count.
  add column if not exists links jsonb not null default '[]'::jsonb
    constraint work_requests_links_check
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 3),
  -- The activity a hire was asked for, when the sender came from one. Set null
  -- if the activity is deleted: the request outlives it.
  add column if not exists task_id uuid references public.tasks(id) on delete set null,
  -- Set only once a yes has started real work: the rollout the two people are on
  -- together. Sender side only, like release_id.
  add column if not exists shared_release_id uuid references public.releases(id) on delete set null,
  add column if not exists started_at timestamptz;

-- The admin read: how many accepted requests turned into a rollout.
create index if not exists work_requests_shared_idx
  on public.work_requests(shared_release_id)
  where shared_release_id is not null;

-- 2. A hire is not a seat -------------------------------------------------------

alter table public.workspace_members
  add column if not exists is_hire boolean not null default false;

-- The hire ceiling's own read, and the seat count's second query. Partial, so it
-- stays tiny however large the team list is.
create index if not exists workspace_members_hires_idx
  on public.workspace_members(workspace_id)
  where is_hire;

-- 3. Featured: picked by Urganize, for a quarter --------------------------------

create table if not exists public.directory_featured (
  id uuid primary key default gen_random_uuid(),

  -- The person featured. They leave the shelf if they delete their account; a
  -- pick of somebody who is gone is nothing to keep.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The role they are featured FOR. A person can be featured for two.
  role text not null
    constraint directory_featured_role_check
    check (role in (
      'manager', 'a_and_r', 'producer', 'mix_engineer', 'master_engineer',
      'songwriter', 'videographer', 'video_director', 'photographer',
      'graphic_designer', 'pr', 'digital_marketer', 'playlist_curator',
      'booking_agent', 'tour_manager', 'distributor'
    )),

  -- Dates, inclusive: "one quarter, reviewed at the strategy check".
  starts_on date not null,
  ends_on date not null,
  constraint directory_featured_dates_check check (ends_on >= starts_on),

  -- Why, for whoever reviews it at the strategy check. Never shown to anyone.
  note text
    constraint directory_featured_note_check
    check (note is null or char_length(note) <= 200),

  -- Who signed it off ("Lucky signs off"). Set null if that account goes.
  picked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One pick per person per role per start date, so picking somebody twice for the
-- same quarter is a no-op and not two cards.
create unique index if not exists directory_featured_pick_key
  on public.directory_featured(user_id, role, starts_on);

-- The shelf read: who is featured for a role on a given day.
create index if not exists directory_featured_role_idx
  on public.directory_featured(role, ends_on);

alter table public.directory_featured enable row level security;

-- 4. On the rise: earned from delivered work, refreshed monthly ----------------

create table if not exists public.directory_rising (
  id uuid primary key default gen_random_uuid(),

  -- The first day of the month this snapshot is for, UTC.
  month date not null,

  role text not null
    constraint directory_rising_role_check
    check (role in (
      'manager', 'a_and_r', 'producer', 'mix_engineer', 'master_engineer',
      'songwriter', 'videographer', 'video_director', 'photographer',
      'graphic_designer', 'pr', 'digital_marketer', 'playlist_curator',
      'booking_agent', 'tour_manager', 'distributor'
    )),

  user_id uuid not null references auth.users(id) on delete cascade,

  -- 1 is first. Only used to keep a shelf in a stable order.
  rank smallint not null
    constraint directory_rising_rank_check check (rank between 1 and 6),

  -- Why they are here, as the sweep counted it: rollouts live in the window and
  -- the length of their record. For the founder's read and for a test, not for
  -- display.
  evidence jsonb not null default '{}'::jsonb,

  computed_at timestamptz not null default now()
);

create unique index if not exists directory_rising_month_key
  on public.directory_rising(month, role, user_id);

-- The shelf read: this month's people for a role, in order.
create index if not exists directory_rising_shelf_idx
  on public.directory_rising(month, role, rank);

alter table public.directory_rising enable row level security;
