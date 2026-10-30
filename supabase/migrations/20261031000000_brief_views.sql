-- Brief board, phase 4 (#897, 2026-10-31): who has seen the brief.
--
-- One row per person per rollout, its time moved forward each time they open
-- the brief, so the board can say "Seen the brief: 3 of 4". Written by the
-- server on GET /brief; read only by the server.

create table if not exists public.release_brief_views (
  release_id uuid        not null references public.releases (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (release_id, user_id)
);

alter table public.release_brief_views enable row level security;

grant select, insert, update, delete on public.release_brief_views to authenticated, service_role;
