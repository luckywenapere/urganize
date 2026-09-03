-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- issue_reports — in-app bug reports and feature requests, mirrored to Linear
--
-- Founder request: users report issues and make requests from inside Urganize
-- and each one becomes a Linear issue automatically. Before this, the only
-- support path was the `?` HelpMenu's mailto (desktop only — it is
-- `hidden md:block`, so a phone had nothing at all) and a WhatsApp community
-- link. The dedicated "Report a bug" pill was deleted 2026-08-17 (d9c9fa68).
--
-- WHY THE ROW EXISTS AT ALL, given Linear is where the work happens: Linear is
-- a third party we do not control. Posting straight through and dropping the
-- report when it 502s is exactly the failure this feature replaces WhatsApp to
-- avoid. So the row is written FIRST and the Linear push is a follow-up whose
-- outcome lands in `status` — a failed push is a retry job in /admin, never
-- the reporter's problem, and they are told "we got it" either way.
--
-- CONTEXT IS A SNAPSHOT, NOT A JOIN. `context` holds who reported it, on which
-- plan, from which page, at which app version, AS IT WAS at submit time — so a
-- later rename, a plan change or a deleted release never rewrites what was
-- reported. Everything identifying in it is resolved SERVER-SIDE from the
-- authenticated user id; the client only supplies the page path and the app
-- version, which are the only two facts it alone knows. That split is what
-- stops anyone writing a fake plan tier onto the Linear board.
--
-- DELETE RULES, all three deliberate and all three different:
--   * reporter_user_id CASCADE — account deletion destroys the account's data
--     by design (see app/api/account/delete-now), and by the time it happens
--     Linear holds the copy of the report that outlives the account. A
--     set-null here would leave an unattributable row we could never act on.
--   * workspace_id SET NULL — a team can be gone while its bug report is still
--     worth reading; `context` already carries the team's name at submit time.
--   * release_id SET NULL — same, and the release id is in `context` too. The
--     notes.release_id precedent: a report outlives the thing it was about.
--
-- RLS ENABLED WITH ZERO POLICIES, which is the point rather than an omission.
-- Nothing reads these back as the user in v1 (there is no "my reports" list),
-- and every path — the submit route, the admin list, the retry — goes through
-- the service-role client. The pricing_validation_responses / mcp_oauth_*
-- posture. Do not add owner policies without a user-facing surface that needs
-- them: a report can name another person's team, and a select policy is how
-- that leaks.
--
-- ROLLBACK: drop table if exists public.issue_reports;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  release_id uuid references public.releases(id) on delete set null,

  kind text not null check (kind in ('bug', 'request')),
  title text not null,
  body text not null,
  context jsonb not null default '{}'::jsonb,

  -- pending: written, not yet pushed. synced: Linear has it. failed: the push
  -- was refused or unreachable — visible and retryable in /admin.
  status text not null default 'pending' check (status in ('pending', 'synced', 'failed')),
  linear_issue_id text,
  linear_identifier text,
  linear_url text,
  sync_error text,
  attempts integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The admin list is "everything, newest first" and "what still needs a retry",
-- so status leads. The reporter index backs the per-user rate limit, which
-- counts this user's rows inside a rolling window on every submit.
create index if not exists issue_reports_status_created_at_idx
  on public.issue_reports(status, created_at desc);

create index if not exists issue_reports_reporter_created_at_idx
  on public.issue_reports(reporter_user_id, created_at desc);

drop trigger if exists set_issue_reports_updated_at on public.issue_reports;
create trigger set_issue_reports_updated_at
before update on public.issue_reports
for each row execute function public.set_updated_at();

alter table public.issue_reports enable row level security;

-- Deliberately no policies. See the header.

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'issue_reports'
  ) then
    raise exception 'issue_reports was not created';
  end if;
end $$;
