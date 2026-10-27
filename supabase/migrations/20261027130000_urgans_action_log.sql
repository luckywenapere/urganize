-- urgans_action_log: one row for every write UrgAns makes (2026-10-27)
--
-- From every door: chat, voice, MCP, WhatsApp replies, embedded action
-- buttons, cron sweeps, and the memory UrgAns keeps. As UrgAns starts acting
-- on its own, every action has to be traceable or nobody will trust it.
-- Written only by lib/urgans-action-log-server.ts (service role). See
-- docs/notes/2026-10-27-urgans-action-log.md.
--
-- NOT urgans_actions (the embedded-action draft/apply claim) and NOT
-- ai_usage_events (cost). Those stay as they are; this one is about what
-- changed, for whom, and whether a person approved it.
--
-- APPEND-ONLY: service_role may insert and select, nothing may update or
-- delete through the API. RLS is on with no policies, so signed-in users read
-- nothing directly; a view for users would go through a route.
--
-- No foreign keys on actor/workspace/release/object: a deleted release must
-- keep the record of what UrgAns did to it (the billing_events precedent).

create table if not exists public.urgans_action_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('chat', 'voice', 'mcp', 'whatsapp', 'embedded', 'cron', 'memory')),
  trigger text not null,
  tool text not null,
  level text not null check (level in ('read', 'suggest', 'confirm', 'auto')),
  actor_user_id uuid,
  workspace_id uuid,
  release_id uuid,
  object_type text,
  object_id text,
  args jsonb,
  before jsonb,
  after jsonb,
  confirmed boolean not null default false,
  ok boolean not null,
  summary text,
  error text
);

create index if not exists urgans_action_log_release_idx
  on public.urgans_action_log (release_id, created_at desc) where release_id is not null;
create index if not exists urgans_action_log_workspace_idx
  on public.urgans_action_log (workspace_id, created_at desc) where workspace_id is not null;
create index if not exists urgans_action_log_actor_idx
  on public.urgans_action_log (actor_user_id, created_at desc) where actor_user_id is not null;

alter table public.urgans_action_log enable row level security;

-- The default-privileges safety net (20261024120000) grants everything to
-- service_role too, so revoke first and grant back only what append-only needs.
revoke all on public.urgans_action_log from anon, authenticated, service_role;
grant select, insert on public.urgans_action_log to service_role;
