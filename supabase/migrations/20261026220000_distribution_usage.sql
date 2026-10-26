-- Distribution limits (founder, 2026-10-26). One row per release a team sends
-- under its plan ('plan'), and one per release it pays ₦2,100 for beyond it
-- ('extra'). lib/distribution-limits-server.ts is the only writer; the
-- Distribute step reads it through the API, never directly.
--
-- Additive: a new table, nothing else touched.
-- Rollback: drop table public.distribution_usage;

create table if not exists public.distribution_usage (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  release_id    uuid        not null references public.releases(id) on delete cascade,
  artist_key    text        not null,
  artist_name   text,
  kind          text        not null,
  -- The Lagos month a plan send counted in, "2026-10".
  month         text        not null,
  status        text        not null default 'used',
  -- Paystack reference, extra releases only.
  reference     text,
  amount_kobo   integer     not null default 0,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  used_at       timestamptz,
  constraint distribution_usage_kind_check check (kind in ('plan', 'extra')),
  constraint distribution_usage_status_check check (status in ('pending', 'paid', 'used')),
  constraint distribution_usage_month_check check (month ~ '^[0-9]{4}-[0-9]{2}$')
);

create unique index if not exists distribution_usage_plan_release_key
  on public.distribution_usage (release_id) where kind = 'plan';
create unique index if not exists distribution_usage_reference_key
  on public.distribution_usage (reference) where reference is not null;
create index if not exists distribution_usage_workspace_idx
  on public.distribution_usage (workspace_id, created_at);

-- Server only: RLS on and no policies, so only the service role reads or writes.
alter table public.distribution_usage enable row level security;
grant select, insert, update, delete on public.distribution_usage to authenticated, service_role;
