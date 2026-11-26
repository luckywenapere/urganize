-- Day Zero lifetime deals (2026-11-26, #1393).
--
-- One row per Day Zero license. The webhook writes purchase (inactive),
-- activate (active) and deactivate (deactivated, a refund). The activation page
-- attaches the license to the account that claimed it. An account with an
-- ACTIVE license is on Pro for life: getSubscriptionSnapshot folds it in, so
-- nothing is written to subscriptions and a refund only flips this row.
--
-- A refund is final: once deactivated, no activate brings the license back
-- (last_event_ms is a record only). One license belongs to one account;
-- an account may hold more than one license.
--
-- Written by service-role routes only: RLS on, no policies.
-- Additive. Safe to run twice.

create table if not exists public.dayzero_licenses (
  license_key      uuid primary key,
  status           text not null default 'inactive'
    check (status in ('inactive', 'active', 'deactivated')),
  user_id          uuid null references auth.users(id) on delete set null,
  tier             integer null,
  prev_license_key uuid null,
  last_event       text null,
  last_event_ms    bigint null,
  attached_at      timestamptz null,
  deactivated_at   timestamptz null,
  deactivate_reason text null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists dayzero_licenses_user_idx
  on public.dayzero_licenses (user_id) where user_id is not null;

drop trigger if exists dayzero_licenses_set_updated_at on public.dayzero_licenses;
create trigger dayzero_licenses_set_updated_at
  before update on public.dayzero_licenses
  for each row execute function public.set_updated_at();

alter table public.dayzero_licenses enable row level security;

grant select, insert, update, delete on public.dayzero_licenses to service_role;

comment on table public.dayzero_licenses is
  'Day Zero lifetime-deal licenses (#1393). An active license attached to a user gives that user the Pro plan (manager) for life. Service role only.';
