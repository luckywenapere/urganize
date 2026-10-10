-- Profile type: which part of a person's profile LEADS.
--
-- A person's type is DERIVED from the roles they claim and deliver
-- (lib/directory-profile-type.ts), so this column holds only an explicit
-- OWNER OVERRIDE. Null means "work it out". That is also why artists need it:
-- the directory's sixteen roles are all professions, so nothing derives an
-- artist.
--
-- Additive and idempotent. No backfill: every existing row stays null and keeps
-- reading as whatever its roles say. Nothing is deleted or rewritten, and the
-- availability column is untouched (open / selective / closed still mean what
-- they did; only the WORDS shown for them change with the type).

alter table public.person_profiles
  add column if not exists profile_type text;

alter table public.person_profiles
  drop constraint if exists person_profiles_profile_type_check;

alter table public.person_profiles
  add constraint person_profiles_profile_type_check
  check (profile_type is null or profile_type in ('manager', 'artist', 'creative', 'adjacent'));
