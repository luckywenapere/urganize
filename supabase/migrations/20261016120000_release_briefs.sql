-- Release brief (URG-281, 2026-10-16): one page per rollout that the team reads
-- instead of scrolling WhatsApp. New tables only; nothing existing is changed.
--
-- What is stored here is only what a person (or UrgAns) WRITES: the idea, the
-- references, the decisions, a short edit history and the view link. The Dates
-- and Who's on what blocks are derived from tasks on every read, and the Notes
-- block reads the existing notes table, so none of that is copied.
--
-- RLS is enabled with NO policies, deliberately, matching release_messages
-- (20260929100000) and task_comments: every read and write is a service-role
-- route that gates through ensureReleaseTeamReadAccess / WriteAccess
-- (lib/release-access-server.ts), and the view-link toggle additionally checks
-- owner-or-team-admin in app code (canManageBriefShare in lib/release-brief.ts).
-- With no policy, a signed-in browser client can read and write none of it.
--
-- The edit history keeps the newest 30 rows per rollout; the API trims older
-- rows on insert (revisionsToTrim in lib/release-brief.ts).
--
-- Rollback (nothing else references these tables):
--   drop table if exists public.release_brief_revisions;
--   drop table if exists public.release_brief_decisions;
--   drop table if exists public.release_brief_references;
--   drop table if exists public.release_briefs;

create table if not exists public.release_briefs (
  release_id    uuid        primary key references public.releases (id) on delete cascade,
  idea          text        not null default '' check (char_length(idea) <= 4000),
  share_token   text        null unique,
  share_enabled boolean     not null default false,
  updated_by    uuid        null references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table if not exists public.release_brief_references (
  id         uuid        primary key default gen_random_uuid(),
  release_id uuid        not null references public.releases (id) on delete cascade,
  kind       text        not null check (kind in ('link', 'image')),
  url        text        not null check (char_length(url) <= 2000),
  title      text        null check (title is null or char_length(title) <= 120),
  position   integer     not null default 0,
  created_by uuid        null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists release_brief_references_release_idx
  on public.release_brief_references (release_id, position, created_at);

create table if not exists public.release_brief_decisions (
  id         uuid        primary key default gen_random_uuid(),
  release_id uuid        not null references public.releases (id) on delete cascade,
  body       text        not null check (char_length(body) between 1 and 280),
  created_by uuid        null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists release_brief_decisions_release_idx
  on public.release_brief_decisions (release_id, created_at desc);

create table if not exists public.release_brief_revisions (
  id          uuid        primary key default gen_random_uuid(),
  release_id  uuid        not null references public.releases (id) on delete cascade,
  block       text        not null check (block in ('idea', 'references', 'decisions')),
  -- A person's edit carries actor_id; an UrgAns draft that was kept carries
  -- actor_label 'UrgAns' (and the person who kept it in actor_id).
  actor_id    uuid        null references auth.users (id) on delete set null,
  actor_label text        null,
  created_at  timestamptz not null default now()
);

create index if not exists release_brief_revisions_release_idx
  on public.release_brief_revisions (release_id, created_at desc);

drop trigger if exists release_briefs_set_updated_at on public.release_briefs;
create trigger release_briefs_set_updated_at
  before update on public.release_briefs
  for each row execute function public.set_updated_at();

alter table public.release_briefs enable row level security;
alter table public.release_brief_references enable row level security;
alter table public.release_brief_decisions enable row level security;
alter table public.release_brief_revisions enable row level security;
