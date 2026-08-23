-- ─────────────────────────────────────────────────────────────────────────────
-- A plan change that has been agreed but not yet swapped at Paystack
--
-- Paystack has no plan-change endpoint. Moving a subscription between plans
-- means disabling the old subscription and creating a replacement, and the
-- founder does that by hand (founder call, 2026-08-24) rather than the app doing
-- it automatically. The worst automated failure here is disabling a subscription
-- and then failing to create its replacement, which is invisible until access
-- lapses months later; a human doing it cannot fail that way silently.
--
-- So the app records the decision and these three columns are that record.
--
-- WHY NOT A NEW `status` VALUE. Tempting, and it would lock every one of these
-- teams out of the product. `resolveSnapshot` in lib/subscription-access.ts
-- grants access only for status in (active, cancelled, past_due, trialing,
-- free_trial) and treats anything else as expired — so a 'changing' status would
-- read as "no access" to the paywall. It would also violate
-- subscriptions_status_check. A team changing plan is a paying customer with
-- nothing wrong; their status stays 'active'.
--
-- WHY NOT A SECOND ROW. `subscriptions_user_id_key` is UNIQUE on user_id, so one
-- row per user is a hard schema invariant. A plan change cannot be modelled as a
-- pending second subscription.
--
-- WHICH DIRECTION USES WHICH:
--   UPGRADE   - applied immediately once the prorated charge clears, so `plan`
--               and `billing_interval` are overwritten and these columns are
--               cleared. They are only ever set here in the window between the
--               request and the charge landing.
--   DOWNGRADE - no money moves and nothing is taken away early, so `plan` keeps
--               the tier the team paid for and the target waits in these columns
--               until the renewal applies it.
--
-- `pending_plan` deliberately reuses the same value list as `plan` rather than
-- narrowing to the two self-serve tiers: a narrower CHECK here would have to be
-- widened again the first time a tier is added, and the route already refuses
-- everything except a self-serve tier.
--
-- SERVICE-ROLE WRITE ONLY, like billing_interval beside it. RLS on this table is
-- still the permissive inherited `USING (true)` (recorded in CLAUDE.md), so do
-- NOT add a client-writable path: a user who could set their own pending_plan
-- could promote themselves to the flagship tier for free at the next renewal.
--
-- ROLLBACK (safe — nothing reads these columns when the pricing-v2 flag is off,
-- and the route that writes them 404s):
--   alter table public.subscriptions
--     drop column if exists pending_plan,
--     drop column if exists pending_billing_interval,
--     drop column if exists pending_change_requested_at;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.subscriptions
  add column if not exists pending_plan text null,
  add column if not exists pending_billing_interval text null,
  add column if not exists pending_change_requested_at timestamptz null;

-- Drop-then-add: ADD CONSTRAINT has no IF NOT EXISTS (the 20260605 / 20260821 /
-- 20260823 / 20260824 precedent in this directory).
alter table public.subscriptions
  drop constraint if exists subscriptions_pending_plan_check;

alter table public.subscriptions
  add constraint subscriptions_pending_plan_check
  check (
    pending_plan is null
    or pending_plan = any (array[
      'manager'::text,
      'label'::text,
      'enterprise'::text,
      'monthly'::text,
      'annual'::text,
      'yearly'::text,
      'access'::text,
      'custom'::text,
      'founding'::text
    ])
  );

alter table public.subscriptions
  drop constraint if exists subscriptions_pending_billing_interval_check;

alter table public.subscriptions
  add constraint subscriptions_pending_billing_interval_check
  check (
    pending_billing_interval is null
    or pending_billing_interval = any (array['monthly'::text, 'annual'::text])
  );

comment on column public.subscriptions.pending_plan is
  'A plan the team has agreed to move to, not yet in effect. Set for a DOWNGRADE, which applies at the end of the paid period (they keep the tier they paid for until then). An upgrade never rests here for long: it overwrites `plan` as soon as its prorated charge clears. NULL means no change pending. Service-role write only.';

comment on column public.subscriptions.pending_billing_interval is
  'The interval that goes with pending_plan. Almost always the same as billing_interval, because a self-serve change cannot cross intervals; present so a founder-executed interval move has somewhere to live.';

comment on column public.subscriptions.pending_change_requested_at is
  'When the team asked. Read by /admin/teams so the founder can see which Paystack swaps are outstanding and how long they have been waiting, and by the founder alert that names the deadline (the swap has to happen before expires_at or the next charge is at the wrong price).';
