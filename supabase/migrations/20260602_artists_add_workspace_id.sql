-- =============================================================================
-- artists: add workspace_id (additive, nullable, reversible)
-- =============================================================================
--
-- Migration 1 of the workspace-scoped artists initiative. The v1 ICP is a
-- manager with 1–3 artists, but the UI is consolidating around a single
-- "primary" artist per workspace. We need artists.workspace_id wired up before
-- Migration 2 can swap the unique index from (owner_user_id, slug) to
-- partial (workspace_id, slug).
--
-- This migration is intentionally additive only:
--
--   1. Adds workspace_id uuid (nullable) on public.artists.
--   2. Adds FK to public.workspaces(id) ON DELETE CASCADE. Rationale: this
--      mirrors the existing owner_user_id → auth.users ON DELETE CASCADE on
--      the same table, so cascade is already the destruction model for an
--      artist row. SET NULL was considered and rejected — orphaning an artist
--      from its workspace would leave it invisible to the workspace-scoped UI
--      after Migration 2 lands, which is worse than removing the row outright.
--   3. Adds an index on workspace_id for the workspace-scoped read path
--      Phase 2+ will introduce.
--   4. Backfills workspace_id deterministically by joining
--      artists.owner_user_id = workspaces.owner_id. workspaces.owner_id is
--      1:1 with workspace_members(user_id WHERE role='owner') in production
--      (24 rows each, every row aligns), so the join cannot fan out.
--
-- It does NOT:
--
--   - Add any per-workspace uniqueness constraint on artists. The one-artist-
--     per-workspace limit is UI-only by design; the schema permits many.
--   - Change the existing (owner_user_id, slug) unique index. That's
--     Migration 2's job.
--   - Set workspace_id NOT NULL. Also Migration 2.
--   - Touch RLS policies. The existing owner_user_id policy continues to
--     gate writes; workspace-scoped reads will join via workspace_id later.
--
-- Verification against the live state (2026-06-03, post-junk-cleanup):
--
--   - 12 artist rows exist in production. (40 originally; 28 junk rows owned
--     by the Lucky-cluster test accounts were deleted on 2026-06-03 via
--     scripts/cleanup-junk-artists.sql.)
--   - All 12 owners have exactly one owned workspace, so the backfill maps
--     every row to a non-NULL workspace_id.
--   - The single Phase 0 NULL candidate (artist 622f5521 owned by
--     0a6cad1c/luckydio400 — owner had no workspace) was deleted in the
--     cleanup, so it no longer applies.
--
-- The NOTICE block at the end of this migration reports
-- total/mapped/unmapped counts at apply time. Expected after this migration:
-- total=12, mapped=12, unmapped=0.
--
-- A WARNING (not an EXCEPTION) is raised if any row is unmapped. Additive
-- migrations must never block on data state — but unmapped rows mean drift
-- from this script's premise and should be investigated before Migration 2,
-- which tightens artist_id behavior and swaps the unique index.
--
-- Down-migration is provided as a commented block at the bottom of this file.
-- Dropping the column also drops the FK constraint and the index.
-- =============================================================================

begin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. Add workspace_id column (nullable for now)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.artists
  add column if not exists workspace_id uuid null;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. Add FK to workspaces. ON DELETE CASCADE matches the existing
--    owner_user_id → auth.users cascade behavior on this table.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'artists_workspace_id_fkey'
      and table_schema = 'public'
      and table_name = 'artists'
  ) then
    alter table public.artists
      add constraint artists_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete cascade;
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. Index for the upcoming workspace-scoped read path
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create index if not exists artists_workspace_id_idx
  on public.artists(workspace_id);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. Backfill: artists.owner_user_id → workspaces.owner_id
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Only fill rows where workspace_id IS NULL so a re-apply is idempotent.
-- Uses workspaces.owner_id (not workspace_members.user_id where role='owner')
-- since they are 1:1 in production today and workspaces.owner_id has a unique
-- index — the join cannot fan out. Any artist whose owner has no workspace
-- row stays NULL and is surfaced by the verification block below.

update public.artists a
   set workspace_id = w.id
  from public.workspaces w
 where w.owner_id = a.owner_user_id
   and a.workspace_id is null;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5. Verification: report mapped / unmapped counts at apply time
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

do $$
declare
  total_artists int;
  mapped_artists int;
  unmapped_artists int;
begin
  select count(*) into total_artists from public.artists;
  select count(*) into mapped_artists from public.artists where workspace_id is not null;
  select count(*) into unmapped_artists from public.artists where workspace_id is null;

  raise notice 'artists.workspace_id backfill complete: total=%, mapped=%, unmapped=%',
    total_artists, mapped_artists, unmapped_artists;

  -- Post-cleanup live state (2026-06-03): total=12, mapped=12, unmapped=0.
  -- Any unmapped row means a new artist was created for an owner without a
  -- workspace since the dry-run — investigate before Migration 2 runs.
  -- We do NOT raise an exception here — additive migrations must never block
  -- on data state.
  if unmapped_artists > 0 then
    raise warning
      'artists.workspace_id unmapped count (%) > 0. Expected 0 after Phase 0 cleanup. Investigate before Migration 2.',
      unmapped_artists;
  end if;
end $$;

commit;

-- =============================================================================
-- DOWN MIGRATION (apply manually if rolling back this change)
-- =============================================================================
--
-- begin;
--
-- alter table public.artists drop column if exists workspace_id;
--
-- -- The FK constraint (artists_workspace_id_fkey) and the index
-- -- (artists_workspace_id_idx) are dropped automatically when the column is
-- -- dropped, so no separate drop statements are required.
--
-- commit;
