-- AI credits: an append-only ledger, one row per movement of credits.
--
-- WHY A LEDGER AND NOT A BALANCE COLUMN. A balance column is a number two
-- requests can both read and both write, so a refund and a spend that land
-- together lose one of them. A ledger only ever appends, so nothing is lost: the
-- balance is the sum, every credit can be traced to the turn, grant or top-up it
-- came from, and a charge that is delivered twice is refused by the unique
-- dedupe_key rather than applied twice.
--
-- TWO POOLS, because the two kinds of credit behave differently:
--   allowance  the plan's monthly credits. Granted once per billing window and
--              GONE at the end of it (no rollover), so every row carries the
--              window it belongs to and only the current window counts.
--   topup      credits that were bought or granted by hand. They never expire.
-- A turn is paid from the allowance first, then the top-up pool (the split is
-- decided in code, lib/credits/allowance.ts, and written as one row per pool).
--
-- The workspace is the account: billing is per team everywhere else in this
-- product, so credits are too. ON DELETE SET NULL keeps the money record when a
-- team is deleted, the billing_events precedent.
--
-- RLS is on with NO policies: every read and write goes through the service role
-- in the API, the posture every other money table here uses. A signed-in user
-- must never be able to read, write or erase a ledger row from the browser.

create table if not exists public.credit_ledger (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid null references public.workspaces (id) on delete set null,
  -- Who the money belongs to, and who caused the movement (a teammate sending a
  -- message, or an admin granting credits). Neither is a foreign key: the ledger
  -- outlives both people.
  owner_user_id      uuid null,
  actor_user_id      uuid null,
  pool               text not null,
  kind               text not null,
  -- Signed: positive adds, negative spends. Never zero.
  credits            integer not null,
  -- The billing window an allowance row belongs to (its first day). Null on
  -- top-up rows, and required on allowance rows.
  window_start       date null,
  -- A key that makes a movement happen at most once: `allowance:<workspace>:<window>`,
  -- `spend:<request>:<pool>`. A repeat insert fails on the unique index below.
  dedupe_key         text null,
  -- What the provider billed for a spend, in RODI, so a charge can be audited
  -- against the bill. Null on grants.
  provider_cost_rodi numeric(12, 3) null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),

  constraint credit_ledger_pool_check check (pool in ('allowance', 'topup')),
  constraint credit_ledger_kind_check check (kind in ('allowance', 'topup', 'spend', 'adjust', 'refund')),
  constraint credit_ledger_credits_nonzero check (credits <> 0),
  -- An allowance row must say which window it is for, and a top-up row must not.
  constraint credit_ledger_window_matches_pool check ((pool = 'allowance') = (window_start is not null))
);

create unique index if not exists credit_ledger_dedupe_key_uidx
  on public.credit_ledger (dedupe_key)
  where dedupe_key is not null;

create index if not exists credit_ledger_workspace_pool_idx
  on public.credit_ledger (workspace_id, pool, created_at desc);

alter table public.credit_ledger enable row level security;

-- The two balances for a team in one call: the allowance for the window it is
-- in, and the top-up pool. Summed in the database so the API never pages
-- through rows, and kept to the service role. Rows whose workspace was deleted
-- have a null workspace_id and are never summed for anyone.
create or replace function public.credit_balances(p_workspace uuid, p_window date)
returns table (allowance bigint, topup bigint)
language sql
stable
as $$
  select
    coalesce(sum(credits) filter (where pool = 'allowance' and window_start = p_window), 0)::bigint,
    coalesce(sum(credits) filter (where pool = 'topup'), 0)::bigint
  from public.credit_ledger
  where workspace_id = p_workspace;
$$;

revoke all on function public.credit_balances(uuid, date) from public;
revoke all on function public.credit_balances(uuid, date) from anon, authenticated;
grant execute on function public.credit_balances(uuid, date) to service_role;

-- Prove the constraints and the function exist, so a partial application fails
-- here rather than at the first charge.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credit_ledger_window_matches_pool') then
    raise exception 'credit_ledger_window_matches_pool was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'credit_balances') then
    raise exception 'credit_balances was not created';
  end if;
end
$$;
