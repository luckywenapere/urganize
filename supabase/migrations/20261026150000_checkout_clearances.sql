-- Onboarding rules (founder, 2026-10-26). Label and every 6-month or yearly plan
-- start with an onboarding call, and the founder sends the payment link after.
-- A row here is that link: it lets one email pay for one plan and period. The
-- checkout and payment routes refuse a call-led plan without a matching row.
-- Service role only: row level security on, no policies, explicit grants.

create table if not exists public.checkout_clearances (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan text not null check (plan in ('solo', 'manager', 'label')),
  period text not null check (period in ('monthly', 'semiannual', 'annual')),
  cleared_by text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists checkout_clearances_email_idx
  on public.checkout_clearances (lower(email), plan, period);

alter table public.checkout_clearances enable row level security;

grant select, insert, update, delete on public.checkout_clearances to service_role;
