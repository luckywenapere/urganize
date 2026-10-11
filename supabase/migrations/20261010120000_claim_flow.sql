-- Profiles and Directory spec, Lane A: unclaimed profiles from credits, the
-- claim flow, and removal on request (2026-10-10).
--
-- ADDITIVE AND IDEMPOTENT. Needs 20261003100000_relationships.sql (applied in
-- production). Nothing is rewritten, nothing is deleted, every new column is
-- nullable or defaulted, and re-running this file changes nothing.
--
-- What it adds, and why:
--
-- 1. person_profiles.removal_requested_at / removed_at. A person can ask to be
--    taken off. The request hides the page at once (a person who asked to go
--    should not stay online for three days); an admin then confirms, and
--    removed_at is the permanent state. Nothing is deleted: a team's private
--    layer (team_relationships) points at the profile, and deleting it would
--    delete the team's own contact. The sweep never links new credits to a
--    removed profile and never makes a second one for the same email, because
--    the identifiers stay.
--
-- 2. person_claim_invites gets what the claim flow needs. channel says how the
--    link reached the person (an email we sent, or a link the owner shares
--    themselves). release_id says which credit it came from. failed_attempts
--    stops somebody guessing the email or phone on a credit: five wrong tries
--    lock the invite.
--
-- 3. release_credit_submissions.person_hidden. When somebody claims a profile
--    they review their credits, and one that is not theirs is hidden from the
--    profile. The submission itself is untouched: it is the owner's record.
--
-- 4. person_removal_requests. The public "Remove this profile" form writes
--    here and the admin queue reads it. No policies: a stranger with no session
--    submits through a service-role route, and nobody signed in reads it.
--
-- ROLLBACK (manual, children first):
--   drop table if exists public.person_removal_requests;
--   alter table public.release_credit_submissions drop column if exists person_hidden;
--   alter table public.person_claim_invites drop column if exists failed_attempts,
--     drop column if exists sent_at, drop column if exists channel,
--     drop column if exists release_id;
--   alter table public.person_profiles drop column if exists removed_at,
--     drop column if exists removal_requested_at;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 1. Removal ------------------------------------------------------------------

alter table public.person_profiles
  add column if not exists removal_requested_at timestamptz,
  add column if not exists removed_at timestamptz;

create index if not exists person_profiles_removal_idx
  on public.person_profiles(removal_requested_at)
  where removal_requested_at is not null and removed_at is null;

-- 2. Claim invites ------------------------------------------------------------

alter table public.person_claim_invites
  add column if not exists release_id uuid references public.releases(id) on delete set null,
  add column if not exists channel text
    constraint person_claim_invites_channel_check check (channel is null or channel in ('email', 'link')),
  add column if not exists sent_at timestamptz,
  add column if not exists failed_attempts integer not null default 0
    constraint person_claim_invites_attempts_check check (failed_attempts >= 0);

-- 3. Credits the claimant says are not theirs ---------------------------------

alter table public.release_credit_submissions
  add column if not exists person_hidden boolean not null default false;

-- 4. Removal requests ---------------------------------------------------------

create table if not exists public.person_removal_requests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person_profiles(id) on delete cascade,
  -- Whatever the person typed so we can answer them. Never shown publicly.
  contact text not null
    constraint person_removal_requests_contact_check check (char_length(btrim(contact)) between 3 and 254),
  note text
    constraint person_removal_requests_note_check check (note is null or char_length(note) <= 500),
  status text not null default 'open'
    constraint person_removal_requests_status_check check (status in ('open', 'removed', 'dismissed')),
  -- We promise three days. Stored so the queue can show it and sort by it.
  due_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One open request per profile: asking twice does not queue twice.
create unique index if not exists person_removal_requests_open_key
  on public.person_removal_requests(person_id)
  where status = 'open';

create index if not exists person_removal_requests_queue_idx
  on public.person_removal_requests(due_at)
  where status = 'open';

alter table public.person_removal_requests enable row level security;
-- No policies. Written by a public route as service role, read by the admin
-- route as service role.
