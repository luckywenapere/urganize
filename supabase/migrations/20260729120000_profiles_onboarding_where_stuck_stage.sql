-- URG-192: persist the two onboarding answers that were being thrown away.
--
-- The signup wizard (/onboarding) has always asked "Where does a release
-- usually fall apart?" (multi-select) and "Where is this release in its
-- lifecycle?", but both answers only ever lived in sessionStorage and were
-- wiped by clearOnboardingDraft() at the end of the flow. See the note at
-- the top of apps/web/lib/onboarding-draft.ts, which documented the gap.
--
-- Both columns are nullable with no CHECK constraint, validated app-side by
-- the isOnboardingWhereStuck / isOnboardingStage type guards — the same
-- shape as every other onboarding_* column (see
-- 20260720100000_profiles_onboarding_planning_preference.sql).

-- Multi-select, so an array. Defaults to NULL rather than '{}' so we can
-- distinguish "never asked / pre-URG-192 signup" from "asked, user picked
-- nothing" — an empty array is a real answer worth telling apart from the
-- absence of one.
-- Values: 'keeping_team_aligned' | 'tracking_progress' | 'collecting_credits'
--       | 'managing_multiple_releases' | 'marketing_promo' | 'distribution'
alter table public.profiles add column if not exists onboarding_where_stuck text[] null;

-- Single-select.
-- Values: 'just_starting' | 'recorded' | 'preparing' | 'date_set'
--       | 'promoting' | 'post_release'
alter table public.profiles add column if not exists onboarding_stage text null;
