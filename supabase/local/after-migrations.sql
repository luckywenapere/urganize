-- LOCAL ONLY (issue #862). Never run this against production.
--
-- Runs after every migration on the local database (scripts/local-db.mjs).

-- 1. No scheduled calls out of the local database.
-- 20260925140000_pitch_payments_cron schedules two pg_cron jobs that call the
-- app through pg_net, with the URL and secret read from Vault. Locally the Vault
-- secrets do not exist, so the jobs would only fail every 15 minutes; remove
-- them so a local database never makes an outbound request.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname like 'urganize-%';
end $$;

-- 2. NOT NULLs production has on columns that the local bootstrap could only
-- create loosely. The bootstrap makes bare releases/tasks tables so the early
-- migrations can run; the migrations then add these columns with
-- "add column if not exists", which skips the NOT NULL production already had
-- (the 2026-05-24 schema dump, schema-dump.sql, and the header of
-- 20260523_tasks_backfill_drifted_columns.sql). Matching production here means
-- an insert that would fail in production fails locally too.
alter table public.releases alter column title set not null;
alter table public.tasks alter column title set not null;
alter table public.tasks alter column created_by set not null;
alter table public.tasks alter column workspace_id set not null;

-- 3. Let a signed-in person create their own profile row.
-- The app creates the profile from the browser right after sign-up
-- (lib/auth-store.ts upserts a fallback profile when the row is missing), and
-- the server only updates it from then on (onboarding team, access approval).
-- The migrations only define read and update policies on profiles, so without
-- an insert policy a new local account never gets a profile: the persona,
-- onboarding step and closed sign-up approval are then silently not saved.
-- Production must allow it some other way (every account there has a profile),
-- most likely a policy or trigger made by hand. ASSUMED, not checked against
-- production; this is the smallest rule that matches the code.
drop policy if exists "Users can insert own profile (local)" on public.profiles;
create policy "Users can insert own profile (local)"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);
