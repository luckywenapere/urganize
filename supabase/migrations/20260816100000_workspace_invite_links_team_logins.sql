-- Team logins (founder request, 2026-08-16): the manager generates as many
-- sign-in links as they need, copies one into WhatsApp or an email, and the
-- person on the other end opens it, sets their OWN password, and lands in the
-- workspace. Also the compulsory step immediately after a release is created.
--
-- The link machinery already existed (workspace_invite_links, /join/<code>,
-- /invite/accept) — it minted one link at a time with no way to list or
-- revoke what you had minted. These three columns are what a LIST of many
-- links needs to be usable rather than a wall of indistinguishable codes.
--
-- Still service-role only: RLS stays enabled with NO policies (see
-- 20260723210000_workspace_invite_links.sql), so codes are unreadable from
-- the browser and every read goes through an owner/admin-gated API route.

ALTER TABLE public.workspace_invite_links
  -- Who the manager minted this one for. Free text, their own shorthand
  -- ("Tolu — publicist"), shown in the list so they can tell two links apart
  -- and know which one to revoke. Never shown to the person joining.
  ADD COLUMN IF NOT EXISTS label text,
  -- The release this link was auto-generated for, so the list can say what
  -- moment produced it. ON DELETE SET NULL (not CASCADE, deliberately unlike
  -- artist_scope_id above it): artist scope is an access BOUNDARY that must
  -- die with its artist, but this is only provenance — revoking someone's
  -- access because an old release was deleted would be a surprise. The
  -- notes.release_id precedent: a link outlives the release it came from.
  ADD COLUMN IF NOT EXISTS release_id uuid REFERENCES public.releases(id) ON DELETE SET NULL,
  -- Who revoked it. `revoked_at` shipped with the table in 2026-07 and was
  -- never written by anything ("no UI for that yet, but the column is ready");
  -- this is the companion the revoke UI needs for an audit trail.
  ADD COLUMN IF NOT EXISTS revoked_by uuid;

COMMENT ON COLUMN public.workspace_invite_links.label IS
  'Manager-facing shorthand for who this link was minted for. Never rendered to the joiner.';

COMMENT ON COLUMN public.workspace_invite_links.release_id IS
  'Provenance: the release whose creation auto-generated this link. SET NULL on release delete — the link keeps working, it just loses its label context.';

COMMENT ON COLUMN public.workspace_invite_links.revoked_by IS
  'auth.users id of whoever revoked the link. NULL while live, and on rows revoked before this column existed.';

-- The list endpoint reads newest-first per workspace; the existing
-- workspace_invite_links_workspace_idx covers the filter but not the sort.
CREATE INDEX IF NOT EXISTS workspace_invite_links_workspace_created_idx
  ON public.workspace_invite_links (workspace_id, created_at DESC);
