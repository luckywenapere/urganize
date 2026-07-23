-- Artist-scoped memberships (founder decision, 2026-07-23): an invite can be
-- for a TEAMMATE (full workspace visibility — artist_scope_id NULL, the
-- default and the behavior of every existing row) or for an ARTIST, who only
-- sees releases belonging to their own artist. The scope is enforced
-- server-side in release/task reads (see lib/tasks-server.ts and
-- lib/services/release-service.ts).
--
-- ON DELETE SET NULL: if the artist row is ever deleted, the member falls
-- back to full workspace visibility rather than being locked out — the
-- manager can re-scope or remove them from Settings -> Teammates.

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS artist_scope_id uuid REFERENCES public.artists(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.workspace_members.artist_scope_id IS
  'When set, this member only sees releases (and their activities) whose artist_id matches. NULL = full workspace visibility.';
