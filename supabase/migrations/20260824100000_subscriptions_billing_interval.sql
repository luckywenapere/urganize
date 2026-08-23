-- ─────────────────────────────────────────────────────────────────────────────
-- subscriptions.billing_interval — what the tier model stopped encoding
--
-- Under pricing v2 (NEXT_PUBLIC_FEATURE_PRICING_V2) `subscriptions.plan` holds
-- a TIER: 'manager' or 'label'. A tier says nothing about whether the customer
-- bought monthly or annual — where the legacy ids literally were the interval
-- ('monthly', 'annual', 'yearly') — and nothing in the schema recorded it.
--
-- That is not cosmetic. Two live code paths read the interval off the plan name:
--
--   * getPlanExpiry (apps/web/lib/billing.ts) sets the first expires_at.
--   * advancePeriodEnd (apps/web/lib/billing-plans.ts) extends it on renewal.
--
-- With no interval stored, a Label-annual subscriber and a Label-monthly one are
-- indistinguishable, so one of them is wrong by eleven months in whichever
-- direction the name-matching happens to fall.
--
-- WHY A COLUMN AND NOT THE EXISTING JSONB. The checkout hop already rides
-- payments.paystack_response.selected_plan, and selected_interval joins it there
-- with no migration. But a RENEWAL has no payments row — Paystack mints a fresh
-- reference per invoice, so the webhook matches on
-- subscriptions.paystack_subscription_code and reads only that row. There is no
-- jsonb column on subscriptions, so the renewal path needs a real one.
--
-- NULLABLE, and null is meaningful: it means "infer from the plan name", which
-- is exactly right for every row written before today and for the legacy ids
-- that still encode their own interval. resolveBillingInterval() in
-- lib/billing-plans.ts is the one place that inference lives.
--
-- SERVICE-ROLE WRITE ONLY, in practice. CLAUDE.md records that RLS on
-- subscriptions is still the permissive inherited `USING (true)`, so this column
-- inherits that too. Every writer today is the webhook or an admin route using
-- the service-role client. Do NOT add a client-writable path to it: a user who
-- could set their own billing_interval could turn a monthly subscription into a
-- yearly one at the next renewal.
--
-- ROLLBACK (safe — the resolver falls back to plan-name inference, which is the
-- pre-change behaviour exactly):
--   alter table public.subscriptions drop column if exists billing_interval;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.subscriptions
  add column if not exists billing_interval text null;

-- Drop-then-add: ADD CONSTRAINT has no IF NOT EXISTS (the 20260605 / 20260821 /
-- 20260823 precedent in this directory).
alter table public.subscriptions
  drop constraint if exists subscriptions_billing_interval_check;

alter table public.subscriptions
  add constraint subscriptions_billing_interval_check
  check (
    billing_interval is null
    or billing_interval = any (array['monthly'::text, 'annual'::text])
  );

comment on column public.subscriptions.billing_interval is
  'How often this subscription bills: monthly or annual. Required for pricing-v2 tier plans (manager/label), which do not encode the interval in `plan` the way the legacy monthly/annual ids did. NULL means "infer from the plan name" — correct for every legacy row. Written by the Paystack webhook from payments.paystack_response.selected_interval on first charge, and read on every renewal to decide how far to advance expires_at. Service-role write only.';
