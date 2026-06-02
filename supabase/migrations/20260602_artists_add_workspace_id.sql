-- =============================================================================
-- artists: add workspace_id (additive, nullable, reversible)
-- =============================================================================
--
-- Phase 1 of the workspace-scoped artists initiative. The v1 ICP is a manager
-- with 1–3 artists, but the UI is consolidating around a single "primary"
-- artist per workspace. We need artists.workspace_id wired up before any UI
-- change or uniqueness tightening can land.
--
-- This migration is intentionally additive only:
--
--   1. Adds workspace_id uuid (nullable) on public.artists.
--   2. Adds FK to public.workspaces(id) ON DELETE CASCADE. This mirrors the
--      existing owner_user_id → auth.users ON DELETE CASCADE on the same table,
--      so cascade is already the destruction model for an artist row.
--   3. Adds an index on workspace_id for the workspace-scoped read path that
--      Phase 2+ will introduce.
--   4. Backfills workspace_id deterministically by joining
--      artists.owner_user_id = workspaces.owner_id. The owner_id column on
--      workspaces already has a unique index in production
--      (workspaces_owner_id_unique_idx), so the join is at most 1:1.
--
-- It does NOT:
--
--   - Add any per-workspace uniqueness constraint on artists. Left for a
--     later phase, after the lookup-or-create flow in
--     app/api/releases/route.ts stops fragmenting data.
--   - Change the existing (owner_user_id, slug) unique index.
--   - Set workspace_id NOT NULL. Phase 0 recon (2026-06-02) found one
--     production artist row owned by a user with zero owned workspaces; that
--     row stays NULL here and must be resolved manually before any NOT NULL
--     tightening.
--   - Touch RLS policies. The existing owner_user_id policy continues to
--     gate writes. Workspace-scoped reads can join via workspace_id later.
--
-- Verification against Phase 0 inventory (2026-06-02):
--
--   - 40 artist rows exist in production.
--   - 39 rows have an owner whose owned workspace resolves to exactly one
--     workspace via workspaces.owner_id.
--   - 1 row remains NULL:
--       id    = 622f5521-874a-43fa-800c-39aa8ab3883a
--       owner = 0a6cad1c-e708-4f09-b873-08d98fc37d47 (luckydio400@gmail.com)
--       name  = 'Luckydidthis'
--     The owner has no row in workspaces, so the join produces no match. This
--     is the only expected NULL after backfill.
--
-- The NOTICE block at the end of this migration reports total/mapped/unmapped
-- counts at apply time. Expected: total=40, mapped=39, unmapped=1.
--
-- A WARNING (not an exception) is raised if unmapped grows past 5. This
-- migration must never block on data state — additive only.
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
-- index — the join cannot fan out.

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

  -- Phase 0 inventory (2026-06-02): total=40, mapped=39, unmapped=1.
  -- If unmapped grows past 5 the production state has drifted from the recon
  -- snapshot — investigate before any later phase touches NOT NULL.
  -- We do NOT raise an exception here — additive migrations should never
  -- block on data state.
  if unmapped_artists > 5 then
    raise warning
      'artists.workspace_id unmapped count (%) is higher than Phase 0 expected (1). Review before Phase 2.',
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
