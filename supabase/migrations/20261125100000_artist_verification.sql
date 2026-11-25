-- Artist verification (2026-11-25, founder approved the mock, issue #1390)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- A team can add any artist and bring in their releases. Nothing checked that
-- the team manages them. Now every artist carries a verification status, and
-- the artist or the manager sends a screenshot of Spotify for Artists or Apple
-- Music for Artists for an admin to approve.
--
-- 1. THE STATUS LIVES ON THE ARTIST, so every screen that already reads the
--    artist can show it. Default 'unverified' for every existing artist too:
--    that is the point, nobody is skipped.
-- 2. THE STATUS BLOCKS NOTHING. It only shows a banner and sends email. The one
--    thing that hides an artist is 'taken_down', and only an admin can set it.
--    There is no timer and no automatic action anywhere.
-- 3. ONE ROW PER SCREENSHOT SENT, kept for the audit trail: who sent it (the
--    artist or a manager), from which service, what the admin answered. The
--    artist row holds the current status; this table holds the history.
-- 4. PRIVATE TO THE TEAM: members can read their own artists' rows. Every
--    write is a service-role route, so nobody can approve themselves.
--
-- ROLLBACK (manual):
--   drop table if exists public.artist_verification_events;
--   drop table if exists public.artist_verifications;
--   alter table public.artists
--     drop column if exists verification_status, drop column if exists verification_note,
--     drop column if exists verified_at, drop column if exists taken_down_at;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.artists
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verification_note text,
  add column if not exists verified_at timestamptz,
  add column if not exists taken_down_at timestamptz;

alter table public.artists drop constraint if exists artists_verification_status_check;
alter table public.artists
  add constraint artists_verification_status_check
  check (verification_status in ('unverified', 'checking', 'needs_fix', 'verified', 'taken_down'));

create table if not exists public.artist_verifications (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  sender text not null default 'manager'
    constraint artist_verifications_sender_check check (sender in ('artist', 'manager')),
  provider text not null
    constraint artist_verifications_provider_check check (provider in ('spotify', 'apple')),
  screenshot_path text not null,
  status text not null default 'checking'
    constraint artist_verifications_status_check check (status in ('checking', 'approved', 'needs_fix', 'superseded')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists artist_verifications_artist_idx
  on public.artist_verifications(artist_id, created_at desc);

create index if not exists artist_verifications_queue_idx
  on public.artist_verifications(status, created_at desc);

alter table public.artist_verifications enable row level security;

drop policy if exists "Team members read their artist verifications" on public.artist_verifications;
create policy "Team members read their artist verifications"
  on public.artist_verifications for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = artist_verifications.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = artist_verifications.workspace_id
        and w.owner_id = auth.uid()
    )
  );

-- The audit trail: every change of status, by whom, with the reason shown to
-- the team. Read by admins only (service role); no policy for anyone else.
create table if not exists public.artist_verification_events (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  action text not null,
  status_after text not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists artist_verification_events_artist_idx
  on public.artist_verification_events(artist_id, created_at desc);

alter table public.artist_verification_events enable row level security;

-- Supabase stops auto-granting new public tables on 30 Oct 2026 (CLAUDE.md,
-- principle 9).
grant select, insert, update, delete on public.artist_verifications to authenticated, service_role;
grant select, insert, update, delete on public.artist_verification_events to service_role;
