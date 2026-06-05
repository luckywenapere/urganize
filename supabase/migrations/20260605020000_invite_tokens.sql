-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Workspace invite tokens
--
-- Adds a per-row secret to workspace_members so the invite-accept page can
-- look up the exact invite a teammate clicked, regardless of what email
-- they sign up with. Closes the "email mismatch = orphaned invite" gap
-- that pure email matching can't see past.
--
-- The previous email-link trigger (20260605010000_invite_linkage_trigger.sql)
-- remains in place as a fallback for invites that were already sent under
-- the old `?email=` URL contract. New invites use tokens; old links keep
-- working because the email path is unchanged.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.workspace_members
  add column if not exists invite_token text null,
  add column if not exists invite_expires_at timestamptz null;

comment on column public.workspace_members.invite_token is
  'Per-invite secret embedded in the /invite/accept URL. UUID-shaped, single-use: cleared on acceptance. Allows token-based linkage independent of the email the invitee signs up with.';

comment on column public.workspace_members.invite_expires_at is
  'Expiry for the invite_token. After this point the token is rejected by the accept endpoint and the row falls back to manager re-invite. NULL on rows that predate the token system.';

-- Partial unique index so accepts can look up rows by token in O(1) AND
-- two different invites cannot collide on token. NULL rows (legacy or
-- already-accepted) are exempt from the constraint.
create unique index if not exists workspace_members_invite_token_unique_idx
  on public.workspace_members(invite_token)
  where invite_token is not null;
