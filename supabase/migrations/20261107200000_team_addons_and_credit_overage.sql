-- Add-ons and AI credits past the allowance (phase 2 of the new pricing,
-- founder approved the mocks docs/mocks/pricing-addons on 2026-11-07, #1112).
--
-- team_addons         one row per add-on bought: extra people, extra artists,
--                     or distribution for one artist (TRM monthly or yearly).
--                     lib/addons-server.ts is the only writer.
-- team_billing_prefs  per team: the monthly cap on credits past the allowance,
--                     and the saved card used for add-on renewals and overage.
-- credit_overage      per team per credit window: credits used past the
--                     allowance, what they cost, and whether they were charged.
-- distribution_usage  'addon' joins the kinds: a send covered by a team's
--                     Distribution add-on.
--
-- Additive: three new tables and one widened check.
-- Rollback: drop table public.team_addons, public.team_billing_prefs,
--   public.credit_overage; drop function public.add_credit_overage;
--   restore distribution_usage_kind_check to ('plan', 'extra').

create table if not exists public.team_addons (
  id                   uuid        primary key default gen_random_uuid(),
  workspace_id         uuid        not null references public.workspaces(id) on delete cascade,
  kind                 text        not null,
  quantity             integer     not null default 1,
  interval             text        not null default 'monthly',
  -- Distribution only: which artist it covers.
  artist_id            uuid,
  artist_key           text,
  artist_name          text,
  unit_price_kobo      integer     not null,
  status               text        not null default 'pending',
  -- First checkout's Paystack reference.
  reference            text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean     not null default false,
  last_charge_reference text,
  failed_at            timestamptz,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint team_addons_kind_check check (kind in ('person', 'artist', 'distribution')),
  constraint team_addons_interval_check check (interval in ('monthly', 'yearly')),
  constraint team_addons_status_check check (status in ('pending', 'active', 'paused', 'cancelled')),
  constraint team_addons_quantity_check check (quantity between 1 and 50),
  constraint team_addons_artist_check check (kind <> 'distribution' or artist_key is not null)
);

create unique index if not exists team_addons_reference_key on public.team_addons (reference) where reference is not null;
create index if not exists team_addons_workspace_idx on public.team_addons (workspace_id, status);
create index if not exists team_addons_due_idx on public.team_addons (current_period_end) where status in ('active', 'paused');

alter table public.team_addons enable row level security;
grant select, insert, update, delete on public.team_addons to authenticated, service_role;

create table if not exists public.team_billing_prefs (
  workspace_id        uuid        primary key references public.workspaces(id) on delete cascade,
  credit_cap_kobo     integer     not null default 0,
  authorization_code  text,
  authorization_email text,
  card_label          text,
  updated_by          uuid,
  updated_at          timestamptz not null default now(),
  constraint team_billing_prefs_cap_check check (credit_cap_kobo between 0 and 100000000)
);

alter table public.team_billing_prefs enable row level security;
grant select, insert, update, delete on public.team_billing_prefs to authenticated, service_role;

create table if not exists public.credit_overage (
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  window_start     date        not null,
  window_end       timestamptz,
  credits          integer     not null default 0,
  rate_kobo        integer     not null,
  status           text        not null default 'open',
  reference        text,
  charged_kobo     integer,
  charged_at       timestamptz,
  attempts         integer     not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (workspace_id, window_start),
  constraint credit_overage_status_check check (status in ('open', 'paid', 'failed', 'waived'))
);

create index if not exists credit_overage_due_idx on public.credit_overage (window_end) where status in ('open', 'failed');

alter table public.credit_overage enable row level security;
grant select, insert, update, delete on public.credit_overage to authenticated, service_role;

-- Add credits used past the allowance to a window, atomically.
create or replace function public.add_credit_overage(
  p_workspace uuid,
  p_window date,
  p_window_end timestamptz,
  p_credits integer,
  p_rate_kobo integer
) returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.credit_overage (workspace_id, window_start, window_end, credits, rate_kobo)
  values (p_workspace, p_window, p_window_end, greatest(p_credits, 0), p_rate_kobo)
  on conflict (workspace_id, window_start)
  do update set credits = public.credit_overage.credits + greatest(excluded.credits, 0), updated_at = now()
  returning credits;
$$;

revoke all on function public.add_credit_overage(uuid, date, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.add_credit_overage(uuid, date, timestamptz, integer, integer) to service_role;

alter table public.distribution_usage drop constraint if exists distribution_usage_kind_check;
alter table public.distribution_usage add constraint distribution_usage_kind_check check (kind in ('plan', 'extra', 'addon'));
create unique index if not exists distribution_usage_addon_release_key
  on public.distribution_usage (release_id) where kind = 'addon';

-- Solo teams now pay us for distribution too (a single, or the add-on), so
-- what we owe TRM can be on a Solo team's row.
alter table public.trm_partner_ledger drop constraint if exists trm_partner_ledger_plan_check;
alter table public.trm_partner_ledger add constraint trm_partner_ledger_plan_check check (plan in ('solo', 'manager', 'pro', 'label'));
