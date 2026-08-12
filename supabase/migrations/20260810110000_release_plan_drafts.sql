-- Release plan drafts: the UrgAns planner's editable working document.
--
-- A manager answers a short intake, UrgAns tailors the hand-crafted rollout
-- template into a draft, the manager edits it, and approval turns the draft
-- into real tasks. Nothing in this table is ever a task: POST .../plan/approve
-- is the only path from here into `tasks`.
--
-- This supersedes the immediate-apply tailor-plan feature (Phase 5), which
-- mutated real task rows the moment the model answered. The draft row is what
-- makes "review before anything is scheduled" possible.
--
-- Design calls worth recording:
--   * ONE row per release (unique index below). The draft is a working
--     document, not history: regenerating replaces it, approving freezes it.
--     The raw model delta is audited separately on
--     releases.ai_tailoring_response, so nothing is lost by not keeping
--     versions here.
--   * release_id is `on delete cascade`, NOT the set-null the notes table
--     uses. A note is the manager's own thinking and outlives its release; a
--     plan draft is derived state for exactly one release and is unreachable
--     without it (the only route is /api/releases/[releaseId]/plan), so an
--     orphan row would be garbage rather than content.
--   * status 'approved' rows are KEPT, not deleted. The row is the
--     double-approve guard (approve claims it with a conditional update) and
--     the provenance record for the tasks it produced. Discarding a draft the
--     manager never approved is a hard DELETE, which returns the release to
--     the plan-less empty state.
--   * `doc` is the whole versioned draft document (schema_version lives
--     inside it). There are no per-task rows because the document is only
--     ever read and written whole: the review scene autosaves the entire
--     draft, the same way the notes editor autosaves a whole body.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.release_plan_drafts;

create table if not exists public.release_plan_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  doc jsonb not null,
  approved_at timestamptz null,
  approved_task_count integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One draft per release. Doubles as the upsert conflict target for regenerate
-- and as the structural guard against two concurrent generate calls landing
-- two drafts.
create unique index if not exists release_plan_drafts_release_id_key
  on public.release_plan_drafts(release_id);

-- RLS read path: every draft belonging to one owner.
create index if not exists release_plan_drafts_owner_user_id_idx
  on public.release_plan_drafts(owner_user_id);

drop trigger if exists set_release_plan_drafts_updated_at on public.release_plan_drafts;
create trigger set_release_plan_drafts_updated_at
before update on public.release_plan_drafts
for each row execute function public.set_updated_at();

alter table public.release_plan_drafts enable row level security;

-- Owner-scoped RLS, matching every other owned table. A draft is private to
-- the release owner: there is no teammate edit path and no public link, so
-- these four policies are the whole access model. The API routes use the
-- service-role client and check ownership themselves; these are defense in
-- depth.

drop policy if exists "Owners view their plan drafts" on public.release_plan_drafts;
create policy "Owners view their plan drafts"
  on public.release_plan_drafts
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create plan drafts" on public.release_plan_drafts;
create policy "Owners create plan drafts"
  on public.release_plan_drafts
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their plan drafts" on public.release_plan_drafts;
create policy "Owners update their plan drafts"
  on public.release_plan_drafts
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their plan drafts" on public.release_plan_drafts;
create policy "Owners delete their plan drafts"
  on public.release_plan_drafts
  for delete
  using (owner_user_id = auth.uid());
