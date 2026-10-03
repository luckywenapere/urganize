-- The AI usage log: one row per provider call, so what AI costs can be summed per
-- release, per team and per feature.
--
-- Why this exists. The credit ledger records what a team was CHARGED, and its
-- spend rows carry tokens and cost in a JSON blob with no release and no feature
-- on them. That is enough to bill a turn and not enough to answer the question
-- the pricing work needs: what does one release cost us to run? Three gaps:
--
--   - a chat turn's ledger row does not say which release the conversation was
--     about, or that it was chat rather than a plan;
--   - a call that FAILED writes nothing, though the provider can still bill the
--     output it had written (a timeout on 2026-10-02 billed about 200 RODI for an
--     answer nobody received);
--   - the status update and the task outcome call the model and are not metered,
--     so they appear nowhere.
--
-- This table is the record of COST. The ledger stays the record of MONEY. They
-- share the request id, so a charge can be set beside what it cost, but neither
-- is derived from the other.
--
-- Rules the rows follow (lib/ai/usage-log.ts):
--   - One row per provider call, numbered within its request. (request_id,
--     call_index) is unique, so recording a request twice records it once.
--   - A FAILED call has an UNKNOWN cost: tokens and cost_rodi are null, never
--     zero. The gateway reports nothing for a call that failed.
--   - credits_charged sits on a request's FIRST row only, so a sum over a release
--     counts a charge once however many calls the request made.
--   - release_id has no foreign key on purpose: the cost of a release is worth
--     keeping after the release is deleted, the urgans_actions.object_id precedent.
--   - feature is free text so a new feature needs no migration; the application
--     validates it.
--
-- RLS is on with no policies: every read and write is a service-role route, the
-- credit_ledger posture. An authenticated user can read nothing here.

create table if not exists public.ai_usage_events (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  request_id     text        not null,
  call_index     integer     not null check (call_index >= 0),
  workspace_id   uuid        null references public.workspaces (id) on delete set null,
  owner_user_id  uuid        null,
  actor_user_id  uuid        null,
  release_id     uuid        null,
  feature        text        not null,
  model          text        null,
  status         text        not null check (status in ('ok', 'failed')),
  failure_kind   text        null,
  tokens_in      integer     null check (tokens_in is null or tokens_in >= 0),
  tokens_out     integer     null check (tokens_out is null or tokens_out >= 0),
  tokens_cached  integer     null check (tokens_cached is null or tokens_cached >= 0),
  cost_rodi      numeric(12, 3) null check (cost_rodi is null or cost_rodi >= 0),
  cost_assumed   boolean     not null default false,
  credits_charged integer    not null default 0 check (credits_charged >= 0),
  constraint ai_usage_events_request_call_unique unique (request_id, call_index),
  -- A failed call has no tokens and no known cost; an ok call is never labelled a failure.
  constraint ai_usage_events_failed_shape check (
    (status = 'ok' and failure_kind is null)
    or (status = 'failed' and tokens_in is null and tokens_out is null and cost_rodi is null)
  )
);

create index if not exists ai_usage_events_release_idx
  on public.ai_usage_events (release_id, created_at desc)
  where release_id is not null;

create index if not exists ai_usage_events_workspace_idx
  on public.ai_usage_events (workspace_id, created_at desc);

create index if not exists ai_usage_events_feature_idx
  on public.ai_usage_events (feature, created_at desc);

alter table public.ai_usage_events enable row level security;

-- What each release has cost, by feature and in total. security_invoker so the
-- caller's row level security applies: with no policies an authenticated user
-- sees nothing, and the service role (which bypasses it) sees everything.
create or replace view public.release_ai_cost_by_feature
with (security_invoker = true) as
select
  release_id,
  feature,
  count(distinct request_id)                         as requests,
  count(*) filter (where status = 'ok')              as calls_ok,
  count(*) filter (where status = 'failed')          as calls_failed,
  coalesce(sum(tokens_in), 0)::bigint                as tokens_in,
  coalesce(sum(tokens_out), 0)::bigint               as tokens_out,
  coalesce(sum(tokens_cached), 0)::bigint            as tokens_cached,
  coalesce(sum(cost_rodi), 0)::numeric(14, 3)        as cost_rodi,
  coalesce(sum(credits_charged), 0)::bigint          as credits_charged,
  min(created_at)                                    as first_at,
  max(created_at)                                    as last_at
from public.ai_usage_events
where release_id is not null
group by release_id, feature;

create or replace view public.release_ai_cost
with (security_invoker = true) as
select
  release_id,
  sum(requests)::bigint        as requests,
  sum(calls_ok)::bigint        as calls_ok,
  sum(calls_failed)::bigint    as calls_failed,
  sum(tokens_in)::bigint       as tokens_in,
  sum(tokens_out)::bigint      as tokens_out,
  sum(tokens_cached)::bigint   as tokens_cached,
  sum(cost_rodi)::numeric(14, 3) as cost_rodi,
  sum(credits_charged)::bigint as credits_charged,
  min(first_at)                as first_at,
  max(last_at)                 as last_at
from public.release_ai_cost_by_feature
group by release_id;

-- Prove the shape exists, so a partial application fails here and not at the
-- first write (which the application would swallow).
do $$
begin
  if not exists (select 1 from pg_class where relname = 'ai_usage_events' and relrowsecurity) then
    raise exception 'ai_usage_events is missing or has row level security off';
  end if;
  if exists (select 1 from pg_policies where tablename = 'ai_usage_events') then
    raise exception 'ai_usage_events must have no policies';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_events_request_call_unique') then
    raise exception 'ai_usage_events_request_call_unique was not created';
  end if;
  if not exists (select 1 from pg_class where relname = 'release_ai_cost' and relkind = 'v') then
    raise exception 'release_ai_cost was not created';
  end if;
end $$;
