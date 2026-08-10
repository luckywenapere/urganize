-- Playlist pitching: teams pitch songs from a release to curator-owned
-- playlists; curators review those pitches in their own inbox.
--
-- A sanctioned v1 scope expansion (see CLAUDE.md for the decision record; the
-- ordinal is deliberately not repeated here, since two other expansions were in
-- flight on separate branches when this was written). Two things make this
-- feature structurally different from every surface built before it, and both
-- shaped the schema below:
--
--   1. A NEW ACCOUNT TYPE. A curator is an authenticated user who is not part
--      of any team and owns no releases. profiles.role gains 'curator'. Every
--      other role in this product can see releases; this one must never.
--
--   2. THE FIRST CROSS-TENANT READ. Until now every owned table was read only
--      by its owner (owner_user_id = auth.uid()) and teammate visibility was
--      done in application code with the service-role client. A pitch is read
--      by TWO unrelated accounts: the team that sent it and the curator it was
--      addressed to. playlist_pitches therefore carries two SELECT policies,
--      one per side, and nothing else.
--
-- Design calls worth recording:
--
--   * EVERY FIELD THE CURATOR CARD RENDERS IS DENORMALIZED onto the pitch row
--     (song_title, artist_name, pitcher_name, playlist_name). The curator read
--     path must never touch releases, artists, profiles or workspaces — not
--     for performance, but because those joins are exactly the data a curator
--     is not allowed to see. This is also why release_id and playlist_id are
--     `on delete set null`: deleting a release must not empty a curator's
--     inbox, and deleting a playlist must not erase the team's pitch history.
--
--   * curator_user_id IS `on delete cascade`. A curator deleting their account
--     removes their inbox and, with it, the team's record of pitches sent to
--     them. Data deletion beats history here: the pitch was addressed to a
--     person, so it goes when the person does.
--
--   * playlist_pitches HAS NO INSERT, UPDATE OR DELETE POLICY. Every write
--     carries an invariant RLS cannot express: the ten-waiting-pitches cap per
--     release, the one-waiting-pitch-per-playlist guard, honest denormalized
--     fields (a client insert policy would let a pitcher forge pitcher_name or
--     owner_user_id), and the rule that only a curator may move a status. All
--     writes go through service-role routes under app/api/, so a direct client
--     mutation fails closed. That is deliberate, and it is asserted by the RLS
--     tests in apps/web/lib/pitching-rls.integration.test.ts.
--
--   * curator_invites HAS NO POLICIES AT ALL (RLS on, zero policies), the
--     workspace_invite_links posture: invite codes must not be enumerable by
--     anon or authenticated roles. Only the service-role admin routes read it.
--
--   * curator_profiles HAS NO INSERT POLICY. A curator profile is created only
--     by the service-role join route after it consumes a single-use invite,
--     so nobody can self-mint a curator account.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.playlist_pitches;
--   drop table if exists public.curator_playlists;
--   drop table if exists public.curator_profiles;
--   drop table if exists public.curator_invites;
--   -- and narrow profiles_role_check back if desired (see section 1).

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. profiles.role — admit 'curator'
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
--
-- The live constraint allowed exactly three values: artist, manager,
-- artist-manager. The TypeScript Profile['role'] union in
-- apps/web/lib/supabase/client.ts has always been wider than that, and the
-- teammate invite path writes 'artist-team' (INVITEE_PROFILE_ROLE in
-- app/invite/accept/page.tsx) into signup metadata, which flows unvalidated
-- into the service-role profiles upsert. That combination is a latent
-- constraint violation that predates this feature.
--
-- So this widens to the union of what the app can actually produce, plus
-- 'curator'. Recreating it narrowly would leave that bug in place and could
-- fail against existing rows.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array[
    'artist'::text,
    'manager'::text,
    'artist-manager'::text,
    'artist-team'::text,
    'team-member'::text,
    'viewer'::text,
    'curator'::text
  ]));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. curator_invites — single-use, admin-minted links
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
--
-- Curator access is invite-only. An admin mints a row, sends the link, and the
-- join route consumes it exactly once by stamping used_by/used_at in a
-- conditional update (where used_at is null), so two people racing the same
-- link cannot both become curators.

create table if not exists public.curator_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);

-- The admin list view's only ordering.
create index if not exists curator_invites_created_at_idx
  on public.curator_invites(created_at desc);

alter table public.curator_invites enable row level security;

-- No policies on purpose. See the header: codes must never be enumerable.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. curator_profiles — who the curator is
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
--
-- One row per curator account, keyed by the auth user id (not a synthetic id):
-- there is exactly one profile per curator, forever, so the FK is the key.
-- photo_path holds a Supabase Storage object path in the existing private
-- release-assets bucket under curator/<user_id>/photo/... — signed on read,
-- never public, matching how the workspace logo is handled.

create table if not exists public.curator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 500),
  photo_path text check (photo_path is null or char_length(photo_path) <= 300),
  invite_id uuid references public.curator_invites(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_curator_profiles_updated_at on public.curator_profiles;
create trigger set_curator_profiles_updated_at
before update on public.curator_profiles
for each row execute function public.set_updated_at();

alter table public.curator_profiles enable row level security;

-- A curator reads and edits their own profile. Pitchers see a curator's
-- display name only through the service-role browse route, never directly.

drop policy if exists "Curators view their profile" on public.curator_profiles;
create policy "Curators view their profile"
  on public.curator_profiles
  for select
  using (user_id = auth.uid());

drop policy if exists "Curators update their profile" on public.curator_profiles;
create policy "Curators update their profile"
  on public.curator_profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No insert policy (service-role join route only) and no delete policy
-- (account deletion cascades from auth.users).

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. curator_playlists — the curator's own inventory
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
--
-- follower_count is self-reported and nullable: we do not read platform APIs
-- (third-party music platform integrations are out of scope for v1), so this
-- is the curator's own number or nothing. genres is a free-form text[] rather
-- than an enum because genre vocabulary in this industry is not enumerable and
-- the tags are for filtering, not for structured logic.

create table if not exists public.curator_playlists (
  id uuid primary key default gen_random_uuid(),
  curator_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  platform text not null check (platform = any (array[
    'spotify'::text,
    'apple_music'::text,
    'audiomack'::text,
    'youtube'::text,
    'other'::text
  ])),
  genres text[] not null default '{}' check (cardinality(genres) <= 10),
  follower_count integer check (follower_count is null or follower_count >= 0),
  url text not null check (char_length(url) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The curator's own list.
create index if not exists curator_playlists_curator_idx
  on public.curator_playlists(curator_user_id);

-- The pitcher-side browse filters (service-role, cross-curator).
create index if not exists curator_playlists_platform_idx
  on public.curator_playlists(platform);
create index if not exists curator_playlists_genres_idx
  on public.curator_playlists using gin (genres);

drop trigger if exists set_curator_playlists_updated_at on public.curator_playlists;
create trigger set_curator_playlists_updated_at
before update on public.curator_playlists
for each row execute function public.set_updated_at();

alter table public.curator_playlists enable row level security;

-- Full owner CRUD: a playlist is the curator's own data with no cross-account
-- invariant a route has to enforce.

drop policy if exists "Curators view their playlists" on public.curator_playlists;
create policy "Curators view their playlists"
  on public.curator_playlists
  for select
  using (curator_user_id = auth.uid());

drop policy if exists "Curators create playlists" on public.curator_playlists;
create policy "Curators create playlists"
  on public.curator_playlists
  for insert
  with check (curator_user_id = auth.uid());

drop policy if exists "Curators update their playlists" on public.curator_playlists;
create policy "Curators update their playlists"
  on public.curator_playlists
  for update
  using (curator_user_id = auth.uid())
  with check (curator_user_id = auth.uid());

drop policy if exists "Curators delete their playlists" on public.curator_playlists;
create policy "Curators delete their playlists"
  on public.curator_playlists
  for delete
  using (curator_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5. playlist_pitches — one row per pitch, read by both sides
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
--
-- owner_user_id is the release owner at pitch time. It is the team-visibility
-- key: teammates see a release because it is owned by someone in a shared
-- workspace (the releaseOwnerIds model in apps/web/lib/tasks-server.ts), and
-- the pitch list route reuses exactly that gate. Denormalizing it here means
-- the sender-side RLS policy needs no join back through releases (the
-- release_credit_submissions precedent).
--
-- created_by is the individual who sent it, which may be a teammate rather
-- than the owner. Both appear in the sender SELECT policy so a teammate can
-- still read a pitch they sent even if their workspace membership changes.
--
-- song_url accepts any URL: a song may live on untitled.stream, SoundCloud, a
-- private link or a live DSP page. song_platform is a best-effort read of the
-- hostname (see detectPitchPlatform in apps/web/lib/pitching.ts), null when
-- unrecognized. We never embed a player.

create table if not exists public.playlist_pitches (
  id uuid primary key default gen_random_uuid(),

  -- Release side. release_id goes null rather than cascading: see header.
  release_id uuid references public.releases(id) on delete set null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  pitcher_name text not null check (char_length(pitcher_name) between 1 and 120),

  -- Curator side.
  curator_user_id uuid not null references auth.users(id) on delete cascade,
  playlist_id uuid references public.curator_playlists(id) on delete set null,
  playlist_name text not null check (char_length(playlist_name) between 1 and 120),

  -- The song. There is no track entity in this product (tracks were dropped in
  -- the v1 cut), so a song is a title plus a link.
  song_title text not null check (char_length(song_title) between 1 and 200),
  artist_name text not null check (char_length(artist_name) between 1 and 200),
  song_url text not null check (char_length(song_url) between 1 and 500),
  song_platform text check (song_platform is null or song_platform = any (array[
    'spotify'::text,
    'apple_music'::text,
    'audiomack'::text,
    'youtube'::text,
    'other'::text
  ])),
  note text not null default '' check (char_length(note) <= 300),

  -- The curator's answer. curator_reply is only ever set alongside
  -- added/passed; the route clears it when a status moves back.
  status text not null default 'new' check (status = any (array[
    'new'::text,
    'listened'::text,
    'added'::text,
    'passed'::text
  ])),
  curator_reply text check (curator_reply is null or char_length(curator_reply) <= 200),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The curator inbox: their pitches, newest first.
create index if not exists playlist_pitches_curator_created_idx
  on public.playlist_pitches(curator_user_id, created_at desc);

-- The per-release list on the pitcher side, and the set-null pass Postgres
-- runs when a release is deleted.
create index if not exists playlist_pitches_release_idx
  on public.playlist_pitches(release_id);

-- Team visibility scope.
create index if not exists playlist_pitches_owner_idx
  on public.playlist_pitches(owner_user_id);

-- The set-null pass when a playlist is deleted.
create index if not exists playlist_pitches_playlist_idx
  on public.playlist_pitches(playlist_id);

-- The spam brake: at most ten pitches may be waiting per release. This
-- partial index makes that count an index-only scan.
create index if not exists playlist_pitches_new_per_release_idx
  on public.playlist_pitches(release_id)
  where status = 'new';

-- One waiting pitch per release per playlist. Re-pitching the same song to the
-- same playlist is allowed once the curator has answered, so the constraint is
-- scoped to the waiting state rather than to all history.
create unique index if not exists playlist_pitches_one_waiting_per_playlist_key
  on public.playlist_pitches(release_id, playlist_id)
  where status = 'new';

drop trigger if exists set_playlist_pitches_updated_at on public.playlist_pitches;
create trigger set_playlist_pitches_updated_at
before update on public.playlist_pitches
for each row execute function public.set_updated_at();

alter table public.playlist_pitches enable row level security;

-- Two SELECT policies, one per side of the pitch. Postgres ORs them; they are
-- kept separate so each side's rationale stays readable.

drop policy if exists "Pitch senders view their pitches" on public.playlist_pitches;
create policy "Pitch senders view their pitches"
  on public.playlist_pitches
  for select
  using (owner_user_id = auth.uid() or created_by = auth.uid());

drop policy if exists "Curators view pitches sent to them" on public.playlist_pitches;
create policy "Curators view pitches sent to them"
  on public.playlist_pitches
  for select
  using (curator_user_id = auth.uid());

-- No insert, update or delete policy. See the header: every write has an
-- invariant only a route can enforce, so writes are service-role only and
-- direct client mutations fail closed.
