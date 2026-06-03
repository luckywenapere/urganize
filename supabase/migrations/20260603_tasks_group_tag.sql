-- =============================================================================
-- tasks: add group_name + group_color (single in-row tag)
-- =============================================================================
--
-- Adds the lightweight "group tag" feature: one optional tag per task, stored
-- as two scalar columns on the row (no new table, no FK to a tag dictionary).
-- Picker offers 5 hand-picked presets with pinned colors plus a custom free-
-- text option (default color for customs). UI lives at
-- apps/web/lib/group-presets.ts and the TaskRow / TaskDetailDrawer.
--
-- ASSIGNEE NOTE: the spec also asked for a tasks.assignee_user_id column. That
-- semantic already exists on this table as tasks.assigned_to_user_id (added
-- 2026-05-23 in 20260523_tasks_backfill_drifted_columns.sql, FK to
-- auth.users(id) ON DELETE SET NULL, indexed at tasks_assigned_to_user_id_idx).
-- The PATCH route at /api/tasks/[id] already accepts `assignedToUserId` and
-- writes that column; the workspace-membership validation already gates writes
-- to active workspace_members + the workspace owner. Adding a parallel
-- assignee_user_id column would only compound the existing
-- assigned_to / assigned_to_user_id duplication that CLAUDE.md already flags
-- as Known Issue: "getAuthenticatedUser drift" sibling. So this migration is
-- intentionally just the 2 group columns.
--
-- Reversibility: commented DOWN block at the bottom drops both columns.
-- Backfill: none — both columns default to NULL (unassigned tag is the
-- baseline state for every existing row).
-- =============================================================================

begin;

alter table public.tasks
  add column if not exists group_name text null,
  add column if not exists group_color text null;

commit;

-- =============================================================================
-- DOWN MIGRATION (apply manually if rolling back this change)
-- =============================================================================
--
-- begin;
--
-- alter table public.tasks
--   drop column if exists group_name,
--   drop column if exists group_color;
--
-- commit;
