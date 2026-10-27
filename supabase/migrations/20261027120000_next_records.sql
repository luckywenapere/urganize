-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The next record (2026-10-27, founder approved the mocks)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- A record still being made: songs, sessions and the people in them. It sits
-- under the artist in Catalogue and becomes a rollout (a `releases` row) only
-- when the team plans it. See docs/notes/2026-10-27-next-record.md.
--
-- Decisions worth knowing before changing anything here:
--
-- 1. NOT A `releases` ROW. Rollout counts, plan limits, the Home "plan a
--    rollout" card and the scoreboard all count `releases`; a record in the
--    making would make each of them lie. `release_id` is set when it becomes
--    one. Same reasoning as artist_catalogue_releases (20261026150000).
-- 2. NOT THE OLD `songs` TABLE. That one is owner-scoped (Shows, 2026-08-30)
--    and this is team work. Its rows stay untouched.
-- 3. TEAM-SCOPED. Every row carries workspace_id; members read, the service
--    role writes (every write is a route that checks the team first).
-- 4. "NEXT WEEK" STAYS WORDS. A session has a nullable date and a date_hint,
--    so a vague day is never turned into a made-up one.
-- 5. PEOPLE ARE CONTACTS. person_id points at Relationships' person_profiles;
--    `name` is kept beside it so a person removed later still reads.
--
-- ROLLBACK (manual):
--   drop table if exists public.record_session_songs, public.record_session_people,
--     public.record_sessions, public.record_songs, public.next_records;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.next_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null default 'Untitled'
    constraint next_records_title_check check (char_length(btrim(title)) between 1 and 120),
  kind text
    constraint next_records_kind_check check (kind is null or kind in ('single', 'ep', 'album')),
  idea text not null default ''
    constraint next_records_idea_check check (char_length(idea) <= 2000),
  status text not null default 'making'
    constraint next_records_status_check check (status in ('making', 'planned', 'dropped')),
  release_id uuid references public.releases(id) on delete set null,
  snooze_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists next_records_artist_idx on public.next_records(artist_id, created_at desc);
create index if not exists next_records_workspace_idx on public.next_records(workspace_id, status);

create table if not exists public.record_songs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null references public.next_records(id) on delete cascade,
  title text not null
    constraint record_songs_title_check check (char_length(btrim(title)) between 1 and 120),
  stage text not null default 'idea'
    constraint record_songs_stage_check check (stage in ('idea', 'recording', 'mixing', 'done')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists record_songs_record_idx on public.record_songs(record_id, position);

create table if not exists public.record_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null references public.next_records(id) on delete cascade,
  session_date date,
  date_hint text not null default ''
    constraint record_sessions_date_hint_check check (char_length(date_hint) <= 40),
  status text not null default 'planned'
    constraint record_sessions_status_check check (status in ('planned', 'happened', 'moved', 'cancelled')),
  note text not null default ''
    constraint record_sessions_note_check check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists record_sessions_record_idx on public.record_sessions(record_id, session_date);

create table if not exists public.record_session_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null references public.record_sessions(id) on delete cascade,
  person_id uuid references public.person_profiles(id) on delete set null,
  name text not null
    constraint record_session_people_name_check check (char_length(btrim(name)) between 1 and 80),
  role text not null default ''
    constraint record_session_people_role_check check (char_length(role) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists record_session_people_session_idx on public.record_session_people(session_id);
create index if not exists record_session_people_person_idx on public.record_session_people(person_id);

create table if not exists public.record_session_songs (
  session_id uuid not null references public.record_sessions(id) on delete cascade,
  song_id uuid not null references public.record_songs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (session_id, song_id)
);

create index if not exists record_session_songs_song_idx on public.record_session_songs(song_id);

-- RLS: team members read their own team's rows; no write policy, so only the
-- service role writes.
do $$
declare
  t text;
begin
  foreach t in array array['next_records', 'record_songs', 'record_sessions', 'record_session_people', 'record_session_songs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Team members read" on public.%I', t);
    execute format($p$
      create policy "Team members read" on public.%I for select using (
        exists (
          select 1 from public.workspace_members m
          where m.workspace_id = %I.workspace_id and m.user_id = auth.uid() and m.status = 'active'
        )
        or exists (
          select 1 from public.workspaces w
          where w.id = %I.workspace_id and w.owner_id = auth.uid()
        )
      )$p$, t, t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

drop trigger if exists set_next_records_updated_at on public.next_records;
create trigger set_next_records_updated_at
  before update on public.next_records
  for each row execute function public.set_updated_at();

drop trigger if exists set_record_songs_updated_at on public.record_songs;
create trigger set_record_songs_updated_at
  before update on public.record_songs
  for each row execute function public.set_updated_at();

drop trigger if exists set_record_sessions_updated_at on public.record_sessions;
create trigger set_record_sessions_updated_at
  before update on public.record_sessions
  for each row execute function public.set_updated_at();
