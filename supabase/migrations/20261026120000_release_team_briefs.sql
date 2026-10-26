-- The team-facing brief on a rollout (2026-10-26): the AI's reworded goal and
-- main moves, written from the idea notes and the plan. One row per rollout,
-- shared by everyone on it. Read and written only by the server (service role);
-- `fingerprint` says which notes and plan the text was written from, so the
-- brief is only rewritten when they change.

create table if not exists public.release_team_briefs (
  release_id uuid primary key references public.releases(id) on delete cascade,
  content jsonb not null,
  fingerprint text not null,
  updated_at timestamptz not null default now()
);

alter table public.release_team_briefs enable row level security;

grant select, insert, update, delete on public.release_team_briefs to service_role;
