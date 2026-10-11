-- Founder-led seeding (2026-10-10), "Seeding plan" Lane B of the Profiles and
-- Directory spec.
--
-- Lucky pastes up to 30 managers from the sales list. Each becomes a
-- CONSENT-PENDING profile (an unclaimed, private person_profiles row) with a
-- claim link he can send by WhatsApp or email. The manager opens the link,
-- sees a profile built with them, edits it, and publishes. Nothing is listed,
-- served at /p/{slug} or featured until they say yes.
--
-- ADDITIVE AND REVERSIBLE. Nothing is rewritten and nothing is deleted.
--
-- Four decisions worth knowing before changing anything here:
--
-- 1. THE PROFILE IS THE ONE FROM RELATIONSHIPS. A seeded manager is a normal
--    unclaimed person_profiles row (status 'unclaimed', visibility 'private',
--    both already enforced by constraints), so every reader that filters by
--    visibility or user_id already ignores it. The spec says status 'invited';
--    adding a third status would have meant widening a check constraint that
--    the Relationships work owns, so "invited" is a SEEDING state (below) and
--    the profile stays 'unclaimed'.
--
-- 2. THE LINK IS A person_claim_invites ROW, the table Relationships built for
--    exactly this. Its workspace_id was NOT NULL because a team sends those;
--    an operator invite has no team, so the column is made nullable. A token
--    is shown once and only its sha256 is stored, like every other token here.
--
-- 3. seeded_profiles IS THE OPERATOR'S RECORD, private to the founder: who he
--    asked, how to reach them, his notes, and the three dates the weekly
--    numbers are read from (invited, opened, published). RLS on, no policies:
--    only the service-role admin routes touch it. The notes are never shown to
--    the manager; the optional bio_starter is a separate field written to be
--    shown, and is the only text copied onto the profile.
--
-- 4. PUBLISHING IS THEIRS ALONE. Nothing here writes visibility to anything but
--    'private'; the claim route that does is gated on the person's own
--    signed-in request.
--
-- ROLLBACK (manual):
--   drop table if exists public.seeded_profiles;
--   -- Only if no operator invite exists (delete them first):
--   alter table public.person_claim_invites alter column workspace_id set not null;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.person_claim_invites
  alter column workspace_id drop not null;

create table if not exists public.seeded_profiles (
  -- One seeding record per profile. Deleting the profile deletes this.
  person_id uuid primary key references public.person_profiles(id) on delete cascade,

  -- What Lucky typed. contact_name is how he knows them; the profile's own
  -- display_name starts as the same text and is theirs to change.
  contact_name text not null
    constraint seeded_profiles_name_check check (char_length(btrim(contact_name)) between 1 and 80),
  email text
    constraint seeded_profiles_email_check check (email is null or char_length(email) <= 254),
  phone text
    constraint seeded_profiles_phone_check check (phone is null or char_length(phone) <= 20),
  -- Private to the founder. Never shown to the manager.
  notes text not null default ''
    constraint seeded_profiles_notes_check check (char_length(notes) <= 1000),
  -- Written to be shown: copied onto the profile as its first bio, which the
  -- manager edits or replaces.
  bio_starter text
    constraint seeded_profiles_bio_starter_check check (bio_starter is null or char_length(bio_starter) <= 600),

  created_by uuid references auth.users(id) on delete set null,

  -- The three states the weekly numbers count. invited_at is when the link was
  -- made; opened_at the first time the link was opened; published_at the first
  -- time they published (listed in the directory) after claiming.
  invited_at timestamptz not null default now(),
  opened_at timestamptz,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seeded_profiles_invited_idx
  on public.seeded_profiles(invited_at desc);

alter table public.seeded_profiles enable row level security;
-- No policies: this is the operator's list. Every read and write is a
-- service-role route behind the admin check.

drop trigger if exists set_seeded_profiles_updated_at on public.seeded_profiles;
create trigger set_seeded_profiles_updated_at
  before update on public.seeded_profiles
  for each row execute function public.set_updated_at();
