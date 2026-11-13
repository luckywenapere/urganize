-- The homepage proof numbers, counted live (#1248).
--
-- One row per rollout owner: their email, how many rollouts they have and how
-- many tasks are in them. Test rollouts (metadata.test_release) are left out
-- here; our own accounts are left out by the app (GET /api/public/proof-stats),
-- with the same rule /admin/metrics uses (lib/internal-accounts.ts), so that
-- rule has one home and is not copied into SQL.
--
-- security definer because it reads auth.users; only the service role may run
-- it. It returns one row per owner (dozens), not per rollout, so the app can
-- filter and sum without paging.
create or replace function public.marketing_proof_rollup()
returns table (owner_email text, rollouts bigint, tasks bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(u.email)::text as owner_email,
    count(distinct r.id) as rollouts,
    count(t.id) as tasks
  from public.releases r
  join auth.users u on u.id = r.owner_user_id
  left join public.tasks t on t.release_id = r.id
  where coalesce((r.metadata ->> 'test_release')::boolean, false) = false
  group by lower(u.email)
$$;

revoke all on function public.marketing_proof_rollup() from public, anon, authenticated;
grant execute on function public.marketing_proof_rollup() to service_role;
