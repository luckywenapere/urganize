-- Credits never expire, and every credit says where it came from.
--
-- 20261001120000 built the ledger around an allowance that RESET each billing
-- window, so a balance was "this window's allowance plus the top-up pool". The
-- founder's rules (2026-10-01) replaced that: unused monthly credits roll over,
-- the balance never resets, and when a subscription ends the whole remaining
-- balance stays. So the window no longer decides what counts.
--
-- What replaces it is the SOURCE of each credit: `trial`, `allowance` or
-- `topup`. The column that carried the pool now carries the source, because
-- leftover TRIAL credits have to be removable without touching anything else
-- (they are taken back if a trial ends with no plan and no top-up bought), and
-- that needs every grant, and every spend that drew on it, to be tagged.
--
-- A turn draws trial credits first, then the allowance, then the top-up pool, so
-- what is left of the trial is always exactly what a removal should take.
--
-- Changes:
--   - pool accepts 'trial'; kind accepts 'trial' (the one-off grant) and
--     'expire' (a removal of leftover trial credits).
--   - window_start is kept (it still says which billing window an allowance
--     grant was for, and the grant is deduplicated on it) but it no longer drives
--     the balance, and it is now allowed on allowance rows only, never required.
--   - credit_balances(workspace) sums everything per source, all time. The old
--     two-argument version took a window and is dropped.
--
-- Nothing in the ledger is rewritten: a table that has only ever held test rows
-- is untouched, and any existing allowance row simply starts to roll over.

alter table public.credit_ledger drop constraint if exists credit_ledger_pool_check;
alter table public.credit_ledger
  add constraint credit_ledger_pool_check check (pool in ('trial', 'allowance', 'topup'));

alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger
  add constraint credit_ledger_kind_check
  check (kind in ('trial', 'allowance', 'topup', 'spend', 'adjust', 'refund', 'expire'));

-- The old rule tied a window to the allowance pool in both directions. A window
-- is still only meaningful on an allowance row, but a spend that drew on the
-- allowance no longer needs one.
alter table public.credit_ledger drop constraint if exists credit_ledger_window_matches_pool;
alter table public.credit_ledger drop constraint if exists credit_ledger_window_only_on_allowance;
alter table public.credit_ledger
  add constraint credit_ledger_window_only_on_allowance check (pool = 'allowance' or window_start is null);

drop function if exists public.credit_balances(uuid, date);

-- Every source's balance for a team in one call. Summed in the database so the
-- API never pages through rows, and kept to the service role. Rows whose
-- workspace was deleted have a null workspace_id and are never summed.
create or replace function public.credit_balances(p_workspace uuid)
returns table (trial bigint, allowance bigint, topup bigint)
language sql
stable
as $$
  select
    coalesce(sum(credits) filter (where pool = 'trial'), 0)::bigint,
    coalesce(sum(credits) filter (where pool = 'allowance'), 0)::bigint,
    coalesce(sum(credits) filter (where pool = 'topup'), 0)::bigint
  from public.credit_ledger
  where workspace_id = p_workspace;
$$;

revoke all on function public.credit_balances(uuid) from public;
revoke all on function public.credit_balances(uuid) from anon, authenticated;
grant execute on function public.credit_balances(uuid) to service_role;

-- Prove the new shape exists, so a partial application fails here rather than
-- at the first charge.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credit_ledger_window_only_on_allowance') then
    raise exception 'credit_ledger_window_only_on_allowance was not created';
  end if;
  if exists (select 1 from pg_constraint where conname = 'credit_ledger_window_matches_pool') then
    raise exception 'credit_ledger_window_matches_pool is still present';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'credit_balances' and p.pronargs = 1
  ) then
    raise exception 'credit_balances(uuid) was not created';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'credit_balances' and p.pronargs = 2
  ) then
    raise exception 'the two-argument credit_balances is still present';
  end if;
end
$$;
