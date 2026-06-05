-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Invite-linkage trigger
--
-- Fixes a live bug: invited teammates would complete signup (the
-- workspace_members row was inserted with user_id=null + status='invited'
-- by /api/workspace/members/invite), but no code path ever linked the
-- new auth.users row back to the pending invite. Result: invitees ended
-- up authenticated but orphaned from the workspace that invited them.
--
-- The fix is a trigger on auth.users INSERT, not app code, because:
--   * It runs inside the same transaction as signup — atomic with the
--     auth.users row creation. The client cannot skip it by closing the
--     tab before a follow-up HTTP call lands.
--   * It covers every auth path uniformly: supabase.auth.signUp (the
--     email/password path used by /auth and /onboarding) AND
--     supabase.auth.exchangeCodeForSession (the OAuth path used by
--     /auth/callback) both terminate in the same auth.users INSERT, so
--     a single trigger catches both.
--   * It's idempotent — the UPDATE filters on `user_id IS NULL`, so
--     re-running the trigger (which doesn't happen for a given row, but
--     in concept) is safe.
--
-- KNOWN FAILURE MODE — email mismatch:
--   The invite URL today carries `?email=invited@example.com` with no
--   token. If the user signs up with a DIFFERENT email than they were
--   invited at, nothing matches and the row stays orphaned. The fixes
--   for that are (a) carry an invite token in the URL and accept by
--   token, or (b) lock the email field on the signup form when arriving
--   from an invite URL. Both are intentionally out of scope here — this
--   migration closes the gap for the common case (same-email signup)
--   without changing the invite contract.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create or replace function public.link_pending_invites_on_signup()
returns trigger
language plpgsql
security definer
-- search_path is pinned because SECURITY DEFINER functions inherit the
-- caller's search_path otherwise, which is a known privilege-escalation
-- vector. Pin to public + pg_temp so referenced tables resolve
-- deterministically regardless of who triggered the insert.
set search_path = public, pg_temp
as $$
begin
  -- NEW.email may be null on phone-only or anonymous auth flows.
  -- lower(NULL) is NULL → the WHERE clause matches zero rows. Safe no-op.
  if NEW.email is null then
    return NEW;
  end if;

  -- Multi-invite support: link ALL pending rows matching this email,
  -- across every workspace. Realistic when one manager works with
  -- multiple artist teams under the same email.
  --
  -- The NOT EXISTS clause guards against the (workspace_id, user_id)
  -- partial unique index — if this user is somehow already an active
  -- member of the workspace through another row, we leave the orphan
  -- invite alone rather than violate the index. In normal flows this
  -- never fires (the invite endpoint already deduplicates by email per
  -- workspace), but the guard is cheap and makes the trigger safe under
  -- any future invite-flow change.
  update public.workspace_members wm
  set
    user_id    = NEW.id,
    status     = 'active',
    joined_at  = coalesce(wm.joined_at, now()),
    updated_at = now()
  where
    lower(wm.email) = lower(NEW.email)
    and wm.status = 'invited'
    and wm.user_id is null
    and not exists (
      select 1
      from public.workspace_members existing
      where existing.workspace_id = wm.workspace_id
        and existing.user_id = NEW.id
    );

  return NEW;
end;
$$;

-- Trigger lives on auth.users. Supabase supports user-defined triggers
-- on the auth schema (this is the same shape as the standard
-- handle_new_user pattern in the Supabase docs). The migration runs as
-- the service role / postgres owner so the CREATE TRIGGER privilege is
-- available.
drop trigger if exists urganize_link_pending_invites on auth.users;
create trigger urganize_link_pending_invites
after insert on auth.users
for each row
execute function public.link_pending_invites_on_signup();

comment on function public.link_pending_invites_on_signup() is
  'Links pending workspace_members invites (status=invited, user_id=null) to a newly-created auth.users row when the emails match. Idempotent. Fires from the urganize_link_pending_invites trigger on auth.users INSERT.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Backfill — link existing orphaned invites
--
-- Any user who already completed signup before this migration applied
-- is currently authenticated but disconnected from the workspace that
-- invited them. Catch them up by joining auth.users to workspace_members
-- on email and applying the same UPDATE shape as the trigger.
--
-- One-shot: subsequent migrations re-applying will UPDATE zero rows
-- because user_id IS NULL no longer matches.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

update public.workspace_members wm
set
  user_id    = u.id,
  status     = 'active',
  joined_at  = coalesce(wm.joined_at, now()),
  updated_at = now()
from auth.users u
where
  lower(wm.email) = lower(u.email)
  and wm.status = 'invited'
  and wm.user_id is null
  and not exists (
    select 1
    from public.workspace_members existing
    where existing.workspace_id = wm.workspace_id
      and existing.user_id = u.id
  );
