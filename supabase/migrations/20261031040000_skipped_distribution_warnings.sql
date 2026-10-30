-- Warnings a team chose to skip on one rollout (founder, 2026-10-31). Today only
-- the tight Spotify pitch window ("Skip pitch"); the app honours only codes in
-- SKIPPABLE_WARNINGS (apps/web/lib/distribution-rules.ts), so an error can
-- never be hidden this way. Written by POST /api/releases/[id]/distribution/skip
-- with the service role; releases keeps its existing RLS and grants.
alter table public.releases
  add column if not exists skipped_distribution_warnings text[] not null default '{}';
