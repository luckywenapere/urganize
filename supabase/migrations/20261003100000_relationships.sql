-- Relationships, Phase 2 of the build order (2026-10-03).
--
-- Relationships is built ON the directory, not beside it: one person, one
-- profile (person_profiles), plus each team's private layer on top. Until now a
-- profile existed only when a signed-in person opted in, so a producer a team
-- works with every month, who has never heard of Urganize, had no row at all.
-- This lets a team's work create that profile UNCLAIMED, and lets the person
-- claim it later and keep everything they delivered.
--
-- ADDITIVE AND REVERSIBLE. Nothing is rewritten and nothing is deleted. Every
-- existing person_profiles row stays exactly as it is: status defaults to
-- 'claimed', which is what every one of them is.
--
-- Seven decisions worth knowing before changing anything here:
--
-- 1. ONE IDENTITY SPINE. person_profiles.user_id becomes nullable and an
--    unclaimed profile is simply a row with no user. `status` says which, and a
--    constraint ties the two together so they cannot disagree.
--
-- 2. AN UNCLAIMED PROFILE IS PRIVATE, ALWAYS. A constraint refuses any
--    visibility but 'private' while status = 'unclaimed'. Nobody is listed in
--    the directory, or served at /p/{slug}, until they have claimed the
--    profile and chosen to be. Every existing reader already filters by
--    visibility or by user_id, so an unclaimed row is invisible to all of them.
--
-- 3. IDENTITY IS AN EMAIL OR A PHONE NUMBER, NEVER A NAME. person_identifiers
--    holds the normalised values and is unique on (kind, value), so two teams
--    adding the same address end up on ONE profile. It is RLS-on with no
--    policies: it holds everyone's contact details and no client may read it.
--
-- 4. A TEAM'S LABEL FOR A PERSON LIVES ON THE RELATIONSHIP, not on the profile.
--    The profile's display_name for an unclaimed person is whatever the first
--    team typed; showing that to the next team would leak the first team's
--    data. So every team reads and writes its own `label`, and the profile's
--    name is only ever shown once the person has claimed it.
--
-- 5. team_relationships IS THE PRIVATE LAYER: notes, tags, role, last contact,
--    the email and phone the team has for them, any fee a team chose to log. It carries a select policy for the team's own
--    members so a team can never read another's, and NO write policy at all:
--    every write is a service-role route that applies the team and role rules
--    once.
--
-- 6. DUPLICATES ARE FLAGGED, NEVER MERGED, and never on a name alone.
--    person_duplicate_flags records "these two of YOUR contacts look alike" for
--    a person to confirm or dismiss.
--
-- 7. THE LINKS BACK TO THE WORK ARE NULLABLE COLUMNS on the tables the work
--    already lives in (tasks, dj_pack_recipients, release_credit_submissions).
--    A team's interaction history with somebody is DERIVED from those, never
--    typed in. tasks.assigned_person_id is who did the work, and is separate
--    from assigned_to_user_id, the team member who owns it.
--
-- ROLLBACK (manual, children first):
--   alter table public.release_credit_submissions drop column if exists person_id;
--   alter table public.dj_pack_recipients drop column if exists person_id;
--   alter table public.tasks drop column if exists assigned_person_id;
--   drop table if exists public.person_claim_invites;
--   drop table if exists public.person_duplicate_flags;
--   drop table if exists public.team_relationships;
--   drop table if exists public.person_identifiers;
--   -- Only if no unclaimed profile exists (delete them first):
--   alter table public.person_profiles drop constraint if exists person_profiles_claim_consistency;
--   alter table public.person_profiles drop constraint if exists person_profiles_unclaimed_private;
--   alter table public.person_profiles alter column user_id set not null;
--   alter table public.person_profiles drop column if exists status,
--     drop column if exists claimed_at, drop column if exists created_by_workspace_id,
--     drop column if exists merged_into_id;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 1. The identity spine -------------------------------------------------------

alter table public.person_profiles
  alter column user_id drop not null;

alter table public.person_profiles
  add column if not exists status text not null default 'claimed'
    constraint person_profiles_status_check
    check (status in ('unclaimed', 'claimed')),
  add column if not exists claimed_at timestamptz,
  -- Which team first created it, for support and for "who may send the claim
  -- invite". Set null if that team is deleted; the profile outlives it.
  add column if not exists created_by_workspace_id uuid references public.workspaces(id) on delete set null,
  -- Set only by a confirmed merge, never automatically.
  add column if not exists merged_into_id uuid references public.person_profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'person_profiles_claim_consistency'
  ) then
    alter table public.person_profiles
      add constraint person_profiles_claim_consistency
      check ((status = 'claimed') = (user_id is not null));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'person_profiles_unclaimed_private'
  ) then
    alter table public.person_profiles
      add constraint person_profiles_unclaimed_private
      check (status = 'claimed' or visibility = 'private');
  end if;
end $$;

-- The "who has claimed" lookups, and the sweep that links claimed people to
-- their credited work.
create index if not exists person_profiles_status_idx
  on public.person_profiles(status)
  where status = 'unclaimed';

-- 2. Identifiers --------------------------------------------------------------

create table if not exists public.person_identifiers (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person_profiles(id) on delete cascade,
  kind text not null
    constraint person_identifiers_kind_check check (kind in ('email', 'phone')),
  -- Normalised by lib/person-identity.ts: lowercase email, +<digits> phone.
  value text not null
    constraint person_identifiers_value_check check (char_length(value) between 3 and 254),
  -- True once the person has proved they hold it (the claim flow).
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists person_identifiers_kind_value_key
  on public.person_identifiers(kind, value);

create index if not exists person_identifiers_person_idx
  on public.person_identifiers(person_id);

-- 3. The private layer --------------------------------------------------------

create table if not exists public.team_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid not null references public.person_profiles(id) on delete cascade,

  -- What THIS team calls them. See decision 4.
  label text not null
    constraint team_relationships_label_check check (char_length(btrim(label)) between 1 and 80),
  -- The job they do for this team, in the team's own words.
  role text not null default ''
    constraint team_relationships_role_check check (char_length(role) <= 40),
  tags text[] not null default '{}'
    constraint team_relationships_tags_check check (cardinality(tags) <= 12),
  notes text not null default ''
    constraint team_relationships_notes_check check (char_length(notes) <= 4000),
  rate_note text
    constraint team_relationships_rate_note_check check (rate_note is null or char_length(rate_note) <= 200),
  last_contact_at timestamptz,

  -- THIS team's own copy of how to reach them. person_identifiers is shared
  -- across teams and exists only so two teams adding the same address land on
  -- one profile; reading contact details from it would show a team the phone
  -- number another team typed. These are what the team sees.
  email text
    constraint team_relationships_email_check check (email is null or char_length(email) <= 254),
  phone text
    constraint team_relationships_phone_check check (phone is null or char_length(phone) <= 20),

  -- How the relationship began. Descriptive only.
  source text not null default 'manual'
    constraint team_relationships_source_check
    check (source in ('manual', 'task_credit', 'pitch', 'dj_pack', 'credit_submission')),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One relationship per team per person. Also the upsert target.
create unique index if not exists team_relationships_team_person_key
  on public.team_relationships(workspace_id, person_id);

create index if not exists team_relationships_team_idx
  on public.team_relationships(workspace_id, updated_at desc);

create index if not exists team_relationships_person_idx
  on public.team_relationships(person_id);

-- 4. Suspected duplicates -----------------------------------------------------

create table if not exists public.person_duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_a uuid not null references public.person_profiles(id) on delete cascade,
  person_b uuid not null references public.person_profiles(id) on delete cascade,
  reason text not null
    constraint person_duplicate_flags_reason_check check (reason in ('same_name', 'shared_identifier')),
  status text not null default 'open'
    constraint person_duplicate_flags_status_check check (status in ('open', 'dismissed', 'merged')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- A pair is stored once, in a fixed order, so (a,b) and (b,a) cannot both exist.
  constraint person_duplicate_flags_order_check check (person_a < person_b)
);

create unique index if not exists person_duplicate_flags_pair_key
  on public.person_duplicate_flags(workspace_id, person_a, person_b);

create index if not exists person_duplicate_flags_open_idx
  on public.person_duplicate_flags(workspace_id)
  where status = 'open';

-- 5. Claim invites ------------------------------------------------------------

create table if not exists public.person_claim_invites (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person_profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- sha256 of the token. The token itself is shown once and never stored, like
  -- the OAuth tokens: nothing needs it back.
  token_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists person_claim_invites_token_key
  on public.person_claim_invites(token_hash);

create index if not exists person_claim_invites_person_idx
  on public.person_claim_invites(person_id);

-- 6. Links back to the work ---------------------------------------------------

alter table public.tasks
  add column if not exists assigned_person_id uuid
    references public.person_profiles(id) on delete set null;
create index if not exists tasks_assigned_person_idx
  on public.tasks(assigned_person_id)
  where assigned_person_id is not null;

alter table public.dj_pack_recipients
  add column if not exists person_id uuid
    references public.person_profiles(id) on delete set null;
create index if not exists dj_pack_recipients_person_idx
  on public.dj_pack_recipients(person_id)
  where person_id is not null;

alter table public.release_credit_submissions
  add column if not exists person_id uuid
    references public.person_profiles(id) on delete set null;
create index if not exists release_credit_submissions_person_idx
  on public.release_credit_submissions(person_id)
  where person_id is not null;

-- 7. Row level security -------------------------------------------------------

alter table public.person_identifiers enable row level security;
alter table public.team_relationships enable row level security;
alter table public.person_duplicate_flags enable row level security;
alter table public.person_claim_invites enable row level security;

-- person_identifiers and person_claim_invites: NO policies. Contact details and
-- claim tokens are reached only through service-role routes.

-- A team reads its own private layer and nobody else's. Writes have no policy:
-- every write goes through a service-role route.
drop policy if exists "Team members read their relationships" on public.team_relationships;
create policy "Team members read their relationships"
  on public.team_relationships for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = team_relationships.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = team_relationships.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop policy if exists "Team members read their duplicate flags" on public.person_duplicate_flags;
create policy "Team members read their duplicate flags"
  on public.person_duplicate_flags for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = person_duplicate_flags.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = person_duplicate_flags.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop trigger if exists set_team_relationships_updated_at on public.team_relationships;
create trigger set_team_relationships_updated_at
  before update on public.team_relationships
  for each row execute function public.set_updated_at();
