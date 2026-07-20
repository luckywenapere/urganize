-- URG-158: capture a first-run planning preference (AI recommendations vs
-- start from scratch) on the profile.
--
-- This migration also heals known drift: the onboarding wizard columns
-- below were created in production via the /api/user/onboarding route's
-- 501 schema-fallback SQL (PROFILE_ONBOARDING_SQL in apps/web/lib/
-- onboarding.ts) and were never backfilled into a migration file. Every
-- statement is idempotent, so applying this against production (where the
-- wizard columns already exist) only adds the new preference column.

alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists onboarding_step integer not null default 1;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz null;
alter table public.profiles add column if not exists onboarding_role text null;
alter table public.profiles add column if not exists onboarding_persona text null;
alter table public.profiles add column if not exists onboarding_release_process text null;
alter table public.profiles add column if not exists onboarding_biggest_headache text null;
alter table public.profiles add column if not exists onboarding_release_id uuid null references public.releases(id) on delete set null;
alter table public.profiles add column if not exists onboarding_task_id uuid null references public.tasks(id) on delete set null;

-- The new preference. Nullable text, validated app-side by the
-- isOnboardingPlanningPreference type guard — same shape as every other
-- onboarding column (no CHECK constraint, matching the established
-- pattern). Values: 'ai_recommendations' | 'start_from_scratch'.
alter table public.profiles add column if not exists onboarding_planning_preference text null;
