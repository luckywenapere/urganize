-- Chosen-rollout access (founder decision, 2026-10-29, issue #853): a manager
-- can limit any teammate to a list of rollouts, alongside the existing
-- one-artist limit (artist_scope_id, 2026-07-23).
--
-- NULL  = no rollout limit (the default, and every existing row).
-- '{}'  = limited to NOTHING. A deleted rollout is dropped from the list by the
--         app, and an empty list must never widen to "everything" the way a
--         nulled artist_scope_id does.
--
-- No foreign key (Postgres arrays cannot carry one). The app filters the list
-- against releases the member's workspace owner actually owns, so a stale id
-- matches nothing. Enforced server-side in lib/release-access.ts and every
-- caller of WorkspaceAccessContext.releaseScopeBy*.

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS release_scope_ids uuid[] NULL;

COMMENT ON COLUMN public.workspace_members.release_scope_ids IS
  'When set, this member only sees these rollouts (release ids). NULL = no rollout limit. Empty array = sees no rollouts.';
