-- Marketing email consent (URG-251 Part 2, approved by Oyin 2026-10-14).
--
-- Onboarding's "Stay on top of your next move" step asks, with a toggle that
-- is OFF by default, whether the person wants email updates: the monthly
-- digest, tips and offers. This records that answer and when it was given.
--
-- MARKETING ONLY. Transactional email (invites, password resets, sign-in
-- links, deadline reminders, billing) is unaffected and never reads these.
--
--   marketing_email_consent     false by default, and for every existing row:
--                               nobody is opted in without saying yes.
--   marketing_email_consent_at  when the answer (yes or no) was last given;
--                               null means never asked.
--
-- Written by PATCH /api/user/marketing-consent (service role). User-writable
-- under the existing profiles RLS as well (the BEFORE UPDATE guard trigger only
-- blocks trial and paid fields), like ask_after_tasks: it is the person's own
-- choice about their own inbox.
--
-- ROLLBACK (manual, if ever needed):
--   alter table public.profiles drop column if exists marketing_email_consent_at;
--   alter table public.profiles drop column if exists marketing_email_consent;

alter table public.profiles
  add column if not exists marketing_email_consent boolean not null default false;

alter table public.profiles
  add column if not exists marketing_email_consent_at timestamptz null;

comment on column public.profiles.marketing_email_consent is
  'Marketing email opt-in (digest, tips, offers). Default false. Transactional email ignores it. URG-251.';
comment on column public.profiles.marketing_email_consent_at is
  'When marketing_email_consent was last answered (yes or no). Null = never asked. URG-251.';
