-- Referral partners and their commission (strategy doc section 10, "Sound Wave
-- Spotlight terms"; docs/strategy/company-strategy.md).
--
-- A partner has a code. A team that signs up through the partner's link is
-- tagged to them. The partner earns a percentage of that team's subscription
-- payments for the team's first N months, paid monthly. Four tables:
--
--   referral_partners    who can refer, their code, and their terms
--   team_referrals       which team was tagged to which partner, and when
--   subscription_charges one row per subscription payment we received
--   referral_payouts     what we paid a partner for a given month
--
-- WHY subscription_charges EXISTS. Renewals are recorded nowhere today: the
-- Paystack webhook only overwrites subscriptions.amount with the latest charge
-- and inserts no payments row, so the history needed to work out a commission
-- cannot be summed from existing data. This table is the missing record. It is
-- written by the webhook (first charge, renewal, plan-change top-up) and by the
-- admin "Mark paid" action, and nothing else.
--
-- WHY COMMISSION IS NOT STORED. It is worked out from these rows each time the
-- admin page loads (lib/referrals.ts), so a refund or a changed rate cannot
-- leave a stale number behind. The only money fact stored is what was PAID
-- (referral_payouts), because that is a thing that happened.
--
-- All four tables have row level security on and NO policies: every read and
-- write is a service-role route behind the admin check or the webhook. Nothing
-- a signed-in person does can touch them.

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  -- Stored upper case, letters, digits, hyphen and underscore, 3 to 40 long.
  -- Matching is case-insensitive because the code is read off a link.
  code text not null,
  name text not null,
  contact_email text null,
  -- Basis points: 1000 is 10%. Terms live on the partner so a different deal
  -- later is a row, not a deploy.
  commission_bps integer not null default 1000,
  -- How many months of each team's payments earn commission, counted from the
  -- team's first counted payment.
  commission_months integer not null default 12,
  active boolean not null default true,
  note text null,
  created_at timestamptz not null default now(),
  constraint referral_partners_code_shape check (code ~ '^[A-Z0-9_-]{3,40}$'),
  constraint referral_partners_bps_range check (commission_bps between 0 and 10000),
  constraint referral_partners_months_range check (commission_months between 1 and 60)
);

create unique index if not exists referral_partners_code_idx
  on public.referral_partners (code);

create table if not exists public.team_referrals (
  -- One tag per team, ever. The primary key is the guard.
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  -- Restrict: deleting a partner who has tagged teams would silently orphan
  -- the commission owed to them. Deactivate instead.
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  -- The code as it was entered, for the audit trail.
  code_used text not null,
  -- 'link' = the signup link carried it, 'admin' = attached by hand.
  source text not null default 'link',
  -- Only payments on or after this moment can earn commission, so tagging a
  -- team that already pays never reaches back into its history.
  attached_at timestamptz not null default now(),
  attached_by uuid null references auth.users(id) on delete set null,
  constraint team_referrals_source_check check (source in ('link', 'admin'))
);

create index if not exists team_referrals_partner_idx
  on public.team_referrals (partner_id);

create table if not exists public.subscription_charges (
  id uuid primary key default gen_random_uuid(),
  -- The Paystack reference (or the admin_ reference for a hand-entered deal).
  -- Unique, so a redelivered webhook cannot count a payment twice.
  reference text not null,
  workspace_id uuid null references public.workspaces(id) on delete set null,
  -- The OWNER, which is who subscriptions and payments are keyed to.
  user_id uuid null references auth.users(id) on delete set null,
  amount_kobo integer not null,
  plan text null,
  -- 'initial' | 'renewal' | 'plan_change' | 'manual'. Manual is a deal the
  -- founder marked paid by hand; it is counted unless excluded.
  source text not null,
  charged_at timestamptz not null default now(),
  -- Set by an admin when a payment was refunded. A refunded payment earns no
  -- commission. Nothing detects customer refunds automatically, because the
  -- webhook ignores refund events for subscription charges.
  excluded_at timestamptz null,
  excluded_reason text null,
  created_at timestamptz not null default now(),
  constraint subscription_charges_source_check
    check (source in ('initial', 'renewal', 'plan_change', 'manual')),
  constraint subscription_charges_amount_check check (amount_kobo >= 0)
);

create unique index if not exists subscription_charges_reference_idx
  on public.subscription_charges (reference);

create index if not exists subscription_charges_workspace_idx
  on public.subscription_charges (workspace_id, charged_at);

create table if not exists public.referral_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  -- The month the payments CLEARED in, 'YYYY-MM' in Lagos time. The payout for
  -- it is due by the 10th of the month after.
  month text not null,
  amount_kobo integer not null,
  paid_at timestamptz not null default now(),
  paid_by uuid null references auth.users(id) on delete set null,
  note text null,
  constraint referral_payouts_month_shape check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint referral_payouts_amount_check check (amount_kobo >= 0)
);

-- One payout per partner per month. Correcting one is an edit, not a second row.
create unique index if not exists referral_payouts_partner_month_idx
  on public.referral_payouts (partner_id, month);

alter table public.referral_partners enable row level security;
alter table public.team_referrals enable row level security;
alter table public.subscription_charges enable row level security;
alter table public.referral_payouts enable row level security;
