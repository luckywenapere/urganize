-- Release chat threads (Release & Task Chat, Phase 1).
--
-- Structural twin of task_comments (20260525034856_schema_reconciliation.sql)
-- rather than a shared thread_messages table with task_comments merged in:
-- the two threads have different visibility rules (release-team-wide vs.
-- assignee-scoped) and different futures (only the task side is expected to
-- grow a seat-exempt guest-membership table later), so keeping them separate
-- tables keeps those futures from being coupled. See the "Release & Task
-- Chat" build plan for the full reasoning.
--
-- RLS is enabled with NO policies, deliberately matching task_comments'
-- status quo: access is enforced in app code via the service-role client
-- (ensureReleaseTeamReadAccess / ensureReleaseTeamWriteAccess), not RLS. No
-- realtime in v1 either — see the same plan for why building the first
-- genuinely membership-aware RLS policies in this schema is not a v1
-- dependency.

create table if not exists public.release_messages (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists release_messages_release_id_created_at_idx
  on public.release_messages (release_id, created_at);

alter table public.release_messages enable row level security;
