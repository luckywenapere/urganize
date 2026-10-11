-- Directory referral invites (2026-10-11, GitHub #834).
--
-- A manager (any signed-in team member) invites the people they work with
-- (mix engineers, producers, video directors...) into the Directory, from the
-- Directory screen, by email or by a link they share themselves. Each invite
-- reuses the founder-seeding shape exactly: a CONSENT-PENDING profile (an
-- unclaimed, private person_profiles row, name + role) and a
-- person_claim_invites link that lands on /welcome/{token}, where the invitee
-- checks the profile, signs up or signs in, and publishes only if they want to.
--
-- ADDITIVE AND REVERSIBLE. One new table. Nothing is rewritten or deleted.
--
-- Decisions worth knowing before changing anything here:
--
-- 1. THIS IS THE INVITER'S RECORD, the seeded_profiles idea per user: who they
--    asked, as what, how, and the dates their list shows (opened, joined,
--    published). The profile and the link live in the existing tables.
-- 2. person_id is ON DELETE SET NULL, not cascade: if the placeholder profile
--    is deleted (taken down on request) the inviter still sees they asked, and
--    the row still counts against the daily limit.
-- 3. RLS ON, NO POLICIES. Every read and write is a service-role route in
--    lib/directory-invites-server.ts, which only ever reads the caller's own
--    rows. The email is the inviter's own typing and is never shown to anyone
--    else.
-- 4. created_at drives the daily limit (20 per inviter per rolling 24 hours),
--    hence the (inviter_user_id, created_at) index.
--
-- Until this is applied the Directory hides the invite row (the route answers
-- ready: false) and nothing crashes.
--
-- ROLLBACK (manual):
--   drop table if exists public.directory_invites;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.directory_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  person_id uuid references public.person_profiles(id) on delete set null,

  invitee_name text not null
    constraint directory_invites_name_check check (char_length(btrim(invitee_name)) between 1 and 80),
  role text not null
    constraint directory_invites_role_check check (char_length(role) between 1 and 40),
  email text
    constraint directory_invites_email_check check (email is null or char_length(email) <= 254),
  channel text not null default 'link'
    constraint directory_invites_channel_check check (channel in ('email', 'link')),

  email_sent_at timestamptz,
  opened_at timestamptz,
  joined_at timestamptz,
  joined_user_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists directory_invites_inviter_idx
  on public.directory_invites(inviter_user_id, created_at desc);

create index if not exists directory_invites_person_idx
  on public.directory_invites(person_id);

alter table public.directory_invites enable row level security;
-- No policies: service-role routes only.

drop trigger if exists set_directory_invites_updated_at on public.directory_invites;
create trigger set_directory_invites_updated_at
  before update on public.directory_invites
  for each row execute function public.set_updated_at();
