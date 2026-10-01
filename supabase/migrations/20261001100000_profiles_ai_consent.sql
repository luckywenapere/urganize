-- AI permission (2026-10-01). Apple's rule 5.1.2(i): before an app sends a
-- person's data to a third-party AI it must say so and ask. This column holds
-- the moment somebody agreed; null means they have not, and every route that
-- calls an AI model refuses with 403 until it is set.
--
-- Additive and safe to apply before the code ships: nothing reads it until
-- NEXT_PUBLIC_FEATURE_AI_CONSENT is switched on. Every existing account starts
-- as null on purpose, so everyone is asked once.
--
-- Rollback:
--   alter table public.profiles drop column if exists ai_consent_at;

alter table public.profiles
  add column if not exists ai_consent_at timestamptz;

comment on column public.profiles.ai_consent_at is
  'When the person agreed to send their words to our AI partners. Null = not agreed.';
