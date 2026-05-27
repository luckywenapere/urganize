-- =============================================================================
-- Release context + AI tailoring storage
-- Generated: 2026-05-27
-- =============================================================================
--
-- Phase 5 of v1: the AI rollout planner tailors a release's template-generated
-- task list to the manager's stated context. This migration adds two nullable
-- JSONB columns to releases:
--
--   release_context        — the manager's answers (artist scale, budget,
--                            distributor type, audience, special notes).
--                            Pre-fills the tailoring modal on re-run.
--   ai_tailoring_response  — the most recent AI response (the JSON it returned)
--                            plus a tailored_at timestamp, for audit.
--
-- Additive and nullable. Existing releases stay null. No backfill.
-- =============================================================================

begin;

alter table public.releases
  add column if not exists release_context jsonb null,
  add column if not exists ai_tailoring_response jsonb null;

commit;
