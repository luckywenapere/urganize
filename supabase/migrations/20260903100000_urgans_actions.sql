-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- urgans_actions — the log and the Apply claim for embedded UrgAns actions
--
-- "UrgAns in every function", Phase 0 + the first real action,
-- release.draft_plan (spec 6.1, "Draft the plan"). An embedded action —
-- inside a product function rather than in chat — either follows Draft,
-- Review, Apply (a card the user later accepts or discards) or, when there is
-- nothing worth pausing on, runs straight to done in one call (an action's
-- `oneShot` flag; see lib/urgans-actions/types.ts). This table makes either
-- shape auditable, and idempotent for the two-step one. It is NEVER the
-- product data itself, whichever shape wrote the row.
--
-- RELEASE.DRAFT_PLAN ITSELF WAS REDESIGNED 2026-09-15, AFTER THIS TABLE WAS
-- WRITTEN: the review step (drafting into release_plan_drafts, a manager
-- approving or discarding it) is gone. Finishing the intake now builds the
-- plan straight into the rollout's activities in one call — the same
-- createReleasePlan pipeline the workspace card and the chat door both call —
-- so this action is `oneShot: true` and every row it produces lands here
-- already `applied`, with no `drafted` row ever preceding it. Everything
-- below describing the general shape (status, applied_result, the claim)
-- still holds exactly as written, and still fully describes a genuine
-- two-step action like presskit.draft_section — this table was built generic
-- enough that the redesign needed no schema change, only this note.
--
-- WHO DID WHAT, AND WHY THREE ACTOR COLUMNS:
--   * owner_user_id is whose TEAM this counts against and whose child rows
--     get stamped — the release owner, matching the "child rows are stamped
--     with the release owner, never the acting teammate" rule every other
--     team-aware scene already follows (see lib/release-access-server.ts).
--     It is also the tier this run was gated on: plan_at_time is read from
--     the OWNER's team, never the caller's own, so a teammate acting on
--     someone else's release is gated by that release's plan.
--   * actor_user_id is who actually tapped the button — can differ from the
--     owner on a team-write action, and is what the admin summary and the
--     per-team guard (lib/urgans-actions/guard-server.ts) attribute a run to.
--   * workspace_id is the owner's team, for the admin aggregate and the
--     24h-rolling-window guard count. ON DELETE SET NULL, not CASCADE: if a
--     workspace is ever deleted, the record that it drafted N plans this way
--     is exactly the history worth keeping (the billing_events precedent).
--
-- WHY status IS A CLOSED SET BUT action_type/object_type/plan_at_time ARE NOT:
-- the Apply claim (lib/urgans-actions/claim.ts's decideApplyClaim) is a state
-- machine over exactly these four values, so the column has to be a real
-- constraint the database enforces. action_type ('release.draft_plan') and
-- object_type ('release') are free text so a new action or a new object type
-- needs no migration — the billing_events.type precedent exactly.
-- plan_at_time is free text (a PricingTierId as of this migration) so
-- re-cutting a tier never means altering old rows or this constraint.
--
-- object_id HAS NO FOREIGN KEY: this is a polymorphic reference (today always
-- a release id), and a deleted object must keep its log — the same reasoning
-- billing_events' owner/actor columns already use.
--
-- WHY applied_result EXISTS: it is what makes a second call to
-- POST /api/urgans/actions/[actionId]/apply idempotent for ITS OWN callers (a
-- double-tap, two open tabs) — decideApplyClaim returns the FIRST apply's
-- result rather than re-running the write. For a two-step action this is set
-- by that later Apply call. For a ONE-SHOT action (release.draft_plan) it is
-- set at INSERT time instead, since the run itself already did the whole
-- job — a later /apply call on such a row hits decideApplyClaim's
-- return_cached path immediately and never reaches the action's own code
-- again. This used to be a SECOND, independent idempotency claim alongside
-- release_plan_drafts' own `status='draft'` conditional update one layer
-- down, which protected the old review-then-approve flow; that flow is
-- retired for release.draft_plan, so this table's claim now stands on its
-- own for it. It still layers the same way for a two-step action.
--
-- edited_output exists for a two-step action whose review surface is a
-- lightweight inline card rather than a full existing scene — presskit.
-- draft_section is the live example, whose card lets a manager edit the
-- drafted words before accepting them. release.draft_plan has no review step
-- to edit (it is oneShot) and never writes this column.
--
-- tokens_in/tokens_out are NULLABLE, and null must never become 0: null means
-- "not reported" (the gateway/model did not surface usage, or a run's own
-- execute() chose not to record it), and 0 would read as a free run.
--
-- source SAYS WHICH DOOR A RUN CAME THROUGH, and it exists because there are
-- two. The embedded button is one; asking UrgAns for the same thing in chat is
-- the other, and the chat door is deliberately NOT entitlement-gated (see
-- lib/urgans-actions/chat-log-server.ts, which argues that decision in full).
-- Without this column the console cannot tell the two apart, and the only
-- honest reading of a row would be "somebody drafted a plan somehow".
--
-- It defaults to 'button' rather than being required, so every pre-existing
-- write path needs no change and a row that predates the column reads as the
-- door that was the only one when it was written. That is also why this is an
-- amendment to this migration rather than a second file: the table has never
-- been applied anywhere (both NEXT_PUBLIC_FEATURE_URGANS_ACTIONS and
-- NEXT_PUBLIC_FEATURE_RELEASE_PLANNER have never been flipped), so there is no
-- deployed schema to alter. If that turns out to be wrong, the fix is one
-- statement in a new file:
--   alter table public.urgans_actions
--     add column if not exists source text not null default 'button'
--     check (source in ('button', 'chat'));
--
-- WHY RLS IS ENABLED WITH ZERO POLICIES: the scheduled_notifications /
-- workspace_invite_links / billing_events posture. This is an internal log
-- read only by the founder's admin panel and written only by the three
-- /api/urgans/actions routes, all through the service-role client. A team
-- must not be able to read, or forge, its own action history directly.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.urgans_actions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid        null references public.workspaces (id) on delete set null,
  owner_user_id   uuid        null,
  actor_user_id   uuid        null,
  plan_at_time    text        not null,
  action_type     text        not null,
  object_type     text        not null,
  object_id       uuid        not null,
  source          text        not null default 'button'
                    check (source in ('button', 'chat')),
  status          text        not null default 'drafted'
                    check (status in ('drafted', 'applied', 'discarded', 'failed')),
  input_summary   jsonb       not null default '{}'::jsonb,
  output          jsonb       null,
  edited_output   jsonb       null,
  applied_result  jsonb       null,
  model           text        null,
  prompt_version  text        not null,
  tokens_in       integer     null,
  tokens_out      integer     null,
  error           text        null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  applied_at      timestamptz null
);

comment on table public.urgans_actions is
  'Log and Apply claim for embedded UrgAns actions (Draft/Review/Apply inside a product function). Never the product data itself — that still lives in its own table (release_plan_drafts, tasks, ...). Written and read only by the service role via app/api/urgans/actions/*.';

comment on column public.urgans_actions.owner_user_id is
  'Whose team this counts against and whose plan tier gated it — the release owner, never the acting teammate. Distinct from actor_user_id.';

comment on column public.urgans_actions.actor_user_id is
  'Who actually ran this — can differ from owner_user_id when a teammate acts on the release owner''s release.';

comment on column public.urgans_actions.source is
  'Which door this run came through: ''button'' for an embedded action inside a product surface, ''chat'' for the same job asked of UrgAns in conversation. The chat door is metered on the ordinary chat allowance and is not entitlement-gated; the button door is. Defaults to ''button''.';

comment on column public.urgans_actions.plan_at_time is
  'The PricingTierId this run was gated on, captured at run time so a later tier re-cut cannot rewrite what a past run was actually charged against.';

comment on column public.urgans_actions.status is
  'The Apply claim''s state machine (lib/urgans-actions/claim.ts): drafted -> applied (claimed, with or without applied_result yet) -> settled; or discarded / failed. A closed set because the conditional UPDATE that IS the claim depends on it.';

comment on column public.urgans_actions.applied_result is
  'What the FIRST successful Apply returned. A second Apply call on the same row returns this rather than re-running the write — the idempotency guarantee for POST .../apply itself, distinct from release_plan_drafts'' own status=''draft'' claim one layer down.';

comment on column public.urgans_actions.tokens_in is
  'Prompt tokens reported by the model gateway for this run, or null when not reported. NEVER 0 for "not reported" — 0 would read as a free run.';

-- The guard count (embedded actions in the last rolling 24h, per team) and
-- the admin monthly aggregate both filter by workspace and want the newest
-- first.
create index if not exists urgans_actions_workspace_created_idx
  on public.urgans_actions (workspace_id, created_at desc);

-- "What is the latest run on this object" — the review scene's own lookup.
create index if not exists urgans_actions_object_created_idx
  on public.urgans_actions (object_type, object_id, created_at desc);

drop trigger if exists set_urgans_actions_updated_at on public.urgans_actions;
create trigger set_urgans_actions_updated_at
before update on public.urgans_actions
for each row execute function public.set_updated_at();

-- Service-role only. Deliberately NO policies (the billing_events /
-- scheduled_notifications posture): anon/authenticated reads and writes both
-- return nothing, and there is no path for a team to read or forge its own
-- action history.
alter table public.urgans_actions enable row level security;

-- ROLLBACK (manual, if ever needed):
--   drop trigger if exists set_urgans_actions_updated_at on public.urgans_actions;
--   drop table if exists public.urgans_actions;
