-- Short, presentable invite links (founder request, 2026-07-23): the
-- stateless wl.<payload>.<sig> tokens produced Linear-length URLs' opposite —
-- a ~140-char monster. This table backs app.urganize.app/join/<code> links:
-- a short random code per link, workspace + role + optional artist scope
-- stored server-side. Bonus over the stateless form: links can be revoked
-- (revoked_at) — no UI for that yet, but the column is ready.
--
-- Accessed exclusively through the service-role client (admin API routes);
-- RLS is enabled with NO policies so anon/authenticated roles can't read
-- codes directly.

CREATE TABLE IF NOT EXISTS public.workspace_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'member',
  -- ON DELETE CASCADE (not SET NULL): an artist link must die with its
  -- artist rather than silently widen into full-workspace access.
  artist_scope_id uuid REFERENCES public.artists(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

ALTER TABLE public.workspace_invite_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS workspace_invite_links_workspace_idx
  ON public.workspace_invite_links (workspace_id);
