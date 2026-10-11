-- The share reward (founder call, 2026-10-11): one month free, once per team,
-- for tapping any share button in the share-to-socials sheet. The rules live in
-- apps/web/lib/share-reward.ts; the claim is POST /api/workspace/share-reward.
--
-- ADDITIVE AND SAFE IN EITHER ORDER. The app reads these columns defensively:
-- before this runs, the offer simply never shows (the eligibility read fails
-- and answers "no"), and the paywall resolver reads paid_bonus_days on its own
-- so a missing column reads as "no bonus" rather than failing its whole read.
--
-- Three columns on workspaces:
--   * share_reward_claimed_at: when the team claimed it. Once set, never again
--     (the claim is a conditional update on this being null).
--   * share_reward_kind: which way the month went, for the founder.
--     'trial_extended' = trial_ends_at moved 30 days later.
--     'paid_bonus'     = paid_bonus_days gained 30.
--   * paid_bonus_days: days of access AFTER the owner's paid period ends.
--     Relative, not a date, so it always sits on the end of whatever the owner
--     has paid for and a Paystack renewal (which advances expires_at from its
--     current value) cannot overtake it. Paystack is never touched.
--
-- All three are billing fields an owner must not set from the browser, so the
-- self-update guard is extended to them. "Owners manage workspaces" is FOR ALL,
-- so without this an owner could hand themselves bonus days with the anon key.
--
-- ROLLBACK (manual, if ever needed):
--   alter table public.workspaces
--     drop column if exists share_reward_claimed_at,
--     drop column if exists share_reward_kind,
--     drop column if exists paid_bonus_days;
--   -- and restore prevent_workspace_billing_self_update from
--   -- 20260823100000_pricing_tiers.sql.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. The columns
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.workspaces
  add column if not exists share_reward_claimed_at timestamptz null,
  add column if not exists share_reward_kind       text        null,
  add column if not exists paid_bonus_days         integer     not null default 0;

-- Already added by 20260823100000_pricing_tiers.sql. Repeated (a no-op where it
-- exists) only because the guard below names it, and a guard naming a missing
-- column would fail every update to workspaces.
alter table public.workspaces
  add column if not exists legacy_rate_expires_at timestamptz null;

alter table public.workspaces drop constraint if exists workspaces_share_reward_kind_check;
alter table public.workspaces add constraint workspaces_share_reward_kind_check
  check (share_reward_kind is null or share_reward_kind in ('trial_extended', 'paid_bonus'));

alter table public.workspaces drop constraint if exists workspaces_paid_bonus_days_check;
alter table public.workspaces add constraint workspaces_paid_bonus_days_check
  check (paid_bonus_days >= 0 and paid_bonus_days <= 3660);

comment on column public.workspaces.share_reward_claimed_at is
  'When the team claimed the share reward (one month free for sharing a rollout). Once per team, ever. NULL = not claimed.';

comment on column public.workspaces.share_reward_kind is
  'How the share reward was given: trial_extended (trial_ends_at + 30 days) or paid_bonus (paid_bonus_days + 30).';

comment on column public.workspaces.paid_bonus_days is
  'Days of paid-equivalent access after the owner''s paid period (subscriptions.expires_at) ends. Relative on purpose so renewals carry it forward. Paystack is never changed.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. Extend the self-update guard to the new columns
--
-- Same function as 20260823100000, with the three new columns added to both
-- branches. Replaced whole because a plpgsql body cannot be amended in place,
-- and the trigger is recreated so the two can never disagree.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create or replace function public.prevent_workspace_billing_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
    ''
  );
begin
  if caller_role = 'authenticated' or caller_role = 'anon' then
    if tg_op = 'INSERT' then
      if new.trial_started_at is not null
         or new.trial_ends_at is not null
         or new.comped_at is not null
         or new.comped_by is not null
         or new.billing_plan is not null
         or new.billing_locked_amount is not null
         or new.billing_notes is not null
         or new.legacy_rate_expires_at is not null
         or new.share_reward_claimed_at is not null
         or new.share_reward_kind is not null
         or coalesce(new.paid_bonus_days, 0) <> 0 then
        raise exception 'workspaces: billing fields can only be set by the service role'
          using errcode = '42501';
      end if;
    else
      if new.trial_started_at         is distinct from old.trial_started_at
         or new.trial_ends_at            is distinct from old.trial_ends_at
         or new.comped_at                is distinct from old.comped_at
         or new.comped_by                is distinct from old.comped_by
         or new.billing_plan             is distinct from old.billing_plan
         or new.billing_locked_amount    is distinct from old.billing_locked_amount
         or new.billing_notes            is distinct from old.billing_notes
         or new.legacy_rate_expires_at   is distinct from old.legacy_rate_expires_at
         or new.share_reward_claimed_at  is distinct from old.share_reward_claimed_at
         or new.share_reward_kind        is distinct from old.share_reward_kind
         or new.paid_bonus_days          is distinct from old.paid_bonus_days then
        raise exception 'workspaces: billing fields can only be modified by the service role'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_protect_billing_fields on public.workspaces;
create trigger workspaces_protect_billing_fields
  before insert or update on public.workspaces
  for each row execute function public.prevent_workspace_billing_self_update();
