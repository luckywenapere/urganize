-- Workspace logo (record label / team logo).
--
-- Releases without their own cover art display the workspace logo as an
-- automatic read-time fallback (resolved in apps/web/lib/workspace-logo.ts).
-- Nothing is written to release rows, so the fallback covers old and new
-- releases alike, and uploading real cover art takes over immediately.
--
-- The logo file lives in the existing private `release-assets` bucket under
-- `workspace/<workspace_id>/logo/...`. Release asset paths always start with
-- a release UUID (see buildStoragePath in lib/asset-helpers.ts), so the
-- `workspace/` prefix cannot collide with them.

alter table public.workspaces
  add column if not exists logo_storage_path text null,
  add column if not exists logo_file_name text null;
