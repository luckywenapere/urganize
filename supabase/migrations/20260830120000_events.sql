-- Events: shows, setlists and DJ packs.
--
-- A sanctioned v1 scope expansion (founder call, 2026-08-30). It is the
-- largest one so far and the only one that moves THREE lines off the
-- out-of-scope list at once — standalone events, touring / live show
-- coordination, and a song library as its own entity — while adding a second
-- object that hangs off the artist rather than off a release. Principle 1
-- ("the release is the spine") gains a sibling: Release and Event are peers,
-- and the Song is the join between them.
--
-- Read this header before changing anything here. Six decisions below are
-- load-bearing and each one is cheap to undo by accident.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. NAME COLLISION, deliberate. `public.release_events` already exists and is
--    an AUDIT LOG (type + payload_json, appended by activity tracking). It has
--    nothing to do with a show. This table is `events`. When reading code, the
--    plural bare name is the show; the release_-prefixed one is the log.
--
-- 2. SONG VERSIONS CARRY THEIR OWN STORAGE, and do not reuse `public.assets`.
--    That table carries
--        constraint assets_scope_check check (release_id is not null
--                                             or task_id is not null)
--    which is the release spine enforced in Postgres. A catalog song that
--    belongs to no release cannot be an assets row without weakening that
--    constraint for every existing asset. Rather than degrade the release side
--    to serve the event side, song_versions gets its own storage columns in
--    the same private `release-assets` bucket. The accepted cost is a second
--    upload path, which this repo already tolerates knowingly (AssetUpload
--    Control and lib/song.ts are two independent copies of one flow).
--
-- 3. SONGS AND EVENTS SCOPE THROUGH THE ARTIST, not through a workspace
--    column, because `releases` does exactly that: owner_user_id + artist_id,
--    with the workspace reached via artists.workspace_id. Adding a
--    workspace_id here would be a second, drift-prone answer to a question the
--    release side already answers one way.
--
-- 4. ARTIST DELETION MUST KEEP REFUSING. songs.artist_id and events.artist_id
--    are `on delete restrict`, matching releases.artist_id (see
--    20260830100000_releases_artist_id_restrict.sql). The app-side counter in
--    lib/artists-server.ts (countArtistDeletionBlockers) has to learn about
--    songs and events too, or a manager gets a raw foreign-key error instead
--    of a sentence naming what is in the way.
--
-- 5. WHAT SURVIVES A DELETE, and why each choice differs:
--      songs.release_id            set null  — a song outlives the rollout it
--                                              was written for and stays in
--                                              setlists (the notes precedent).
--      setlist_items.song_id       restrict  — never silently shorten a
--                                              setlist, and never silently
--                                              change its running total. The
--                                              app refuses and names the
--                                              setlists, the way artist
--                                              deletion already does.
--      dj_packs.setlist_id         restrict  — a sent pack is a promise to
--                                              someone outside the team.
--                                              Deleting a setlist must not
--                                              break a DJ's link the night
--                                              before a show.
--      access log recipient/version set null — the log outlives both, and
--                                              carries denormalized names so
--                                              a deleted recipient still
--                                              reads as a real row. It is the
--                                              only deterrent on unreleased
--                                              tracks, so it must not be
--                                              erasable by tidying up.
--
-- 6. TOKEN PER RECIPIENT, PASSCODE PER PACK. The token is on
--    dj_pack_recipients, not on the pack, and that split IS the read-receipt
--    feature: one link each is what makes "Tunde opened it, the engineer did
--    not" answerable. The passcode is opt-in (founder call) and shared,
--    because it is a courtesy lock on the whole pack rather than an identity.
--
-- ROLLBACK (manual, if ever needed) — child tables first:
--   drop table if exists public.dj_pack_access_log;
--   drop table if exists public.dj_pack_recipients;
--   drop table if exists public.dj_packs;
--   drop table if exists public.setlist_items;
--   drop table if exists public.setlists;
--   drop table if exists public.event_run_of_show;
--   drop table if exists public.events;
--   drop table if exists public.song_versions;
--   drop table if exists public.songs;
--   drop type  if exists public.dj_pack_access_action;
--   drop type  if exists public.setlist_item_type;
--   drop type  if exists public.event_status;
--   drop type  if exists public.song_version_label;
-- ─────────────────────────────────────────────────────────────────────────────

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Enums
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Structured, not free text (principle 3). A DJ scanning a pack needs "clean"
-- to mean the same thing on every release.
do $$ begin
  create type public.song_version_label as enum (
    'original',
    'clean',
    'dirty',
    'radio_edit',
    'extended',
    'instrumental',
    'acapella',
    'live'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.event_status as enum (
    'draft',
    'confirmed',
    'done',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

-- Non-song items exist so that a minute of talking counts as a minute. They
-- are the reason the running total is trustworthy.
do $$ begin
  create type public.setlist_item_type as enum (
    'song',
    'talk',
    'interlude',
    'break'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dj_pack_access_action as enum (
    'viewed',
    'downloaded_all',
    'downloaded_track'
  );
exception when duplicate_object then null;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- songs — the join between a release and an event
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete restrict,
  -- Nullable on purpose: a back-catalog song belongs to no active rollout, and
  -- a song whose release is deleted stays in the catalog (set null above).
  release_id uuid references public.releases(id) on delete set null,
  title text not null,
  -- Everything below is nullable because a manager adds a song to a setlist
  -- before they necessarily know any of it. duration_seconds is the one the
  -- product actually needs: null means "ask for it", never zero. Treating an
  -- unknown duration as 0 would quietly under-report a set that is over.
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  musical_key text,
  bpm integer check (bpm is null or (bpm > 0 and bpm < 400)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The catalog read: every song for one artist, which is what the setlist
-- builder pages through.
create index if not exists songs_artist_idx
  on public.songs(artist_id, created_at desc);

-- The set-null pass Postgres runs when a release is deleted, and the "songs on
-- this rollout" read.
create index if not exists songs_release_idx on public.songs(release_id);

create index if not exists songs_owner_idx on public.songs(owner_user_id);

drop trigger if exists set_songs_updated_at on public.songs;
create trigger set_songs_updated_at
before update on public.songs
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- song_versions — the files (see decision 2 above)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.song_versions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  label public.song_version_label not null default 'original',
  file_name text not null,
  file_size bigint not null default 0,
  mime_type text,
  storage_bucket text not null default 'release-assets',
  storage_path text not null,
  -- Per version, not per song: a radio edit is genuinely shorter than the
  -- extended mix, and the setlist total has to use whichever is being played.
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists song_versions_song_idx
  on public.song_versions(song_id, created_at desc);

create index if not exists song_versions_owner_idx
  on public.song_versions(owner_user_id);

drop trigger if exists set_song_versions_updated_at on public.song_versions;
create trigger set_song_versions_updated_at
before update on public.song_versions
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- events — the show
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete restrict,
  title text not null,
  venue_name text,
  city text,
  country text,
  -- IANA name ("Africa/Lagos"), and load-bearing: every time this product
  -- shows a set time it must be in VENUE local time, not the viewer's. Note
  -- this is the first place in the schema that takes timezones seriously —
  -- task due dates elsewhere store naive local wall-clock strings, which is
  -- known sloppiness that must NOT be copied here.
  timezone text not null default 'Africa/Lagos',
  set_start_at timestamptz,
  -- The number everything hangs off. A setlist is measured against it, so it
  -- is not nullable and not a guess.
  set_length_minutes integer not null default 30
    check (set_length_minutes > 0 and set_length_minutes <= 600),
  stage text,
  promoter_name text,
  promoter_phone text,
  status public.event_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The events list: one artist's shows, soonest first. Nulls last so an
-- undated draft does not sit above a confirmed show.
create index if not exists events_artist_idx
  on public.events(artist_id, set_start_at);

create index if not exists events_owner_idx on public.events(owner_user_id);

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- event_run_of_show — call time, soundcheck, doors, load out
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.event_run_of_show (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  at timestamptz,
  -- Explicit ordering rather than sorting by `at`, because these are seeded
  -- in a known running order and a manager fills the times in later.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_run_of_show_event_idx
  on public.event_run_of_show(event_id, position);

drop trigger if exists set_event_run_of_show_updated_at on public.event_run_of_show;
create trigger set_event_run_of_show_updated_at
before update on public.event_run_of_show
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- setlists — an event can hold more than one (build a 25 and a 40)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.setlists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null default 'Main set',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists setlists_event_idx
  on public.setlists(event_id, created_at);

drop trigger if exists set_setlists_updated_at on public.setlists;
create trigger set_setlists_updated_at
before update on public.setlists
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- setlist_items — songs, talk, interludes and breaks, in order
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.setlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  item_type public.setlist_item_type not null default 'song',
  -- Restrict: deleting a song must never silently shorten a setlist or change
  -- its running total. The app refuses and names the setlists instead.
  song_id uuid references public.songs(id) on delete restrict,
  -- Set null: losing the chosen version leaves a real item ("play this song")
  -- that simply needs a version picked again.
  song_version_id uuid references public.song_versions(id) on delete set null,
  -- Deliberately NOT unique with setlist_id. Reordering rewrites the whole
  -- run in one batch, which a unique constraint would force into a shuffle.
  position integer not null default 0,
  -- Null means "resolve from the version, then the song". Only when all three
  -- are unknown does the item need a duration typed in — which the UI asks
  -- for, rather than counting the item as zero.
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  cue_note text,
  -- Free text for non-song items ("Introduce the band", "DJ transition").
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A song item must name a song; nothing else may. Without this a talk item
  -- could carry a song_id and the "which songs are in this pack" read would
  -- quietly include it.
  constraint setlist_items_song_shape check (
    (item_type = 'song' and song_id is not null)
    or (item_type <> 'song' and song_id is null and song_version_id is null)
  )
);

create index if not exists setlist_items_setlist_idx
  on public.setlist_items(setlist_id, position);

create index if not exists setlist_items_song_idx
  on public.setlist_items(song_id);

drop trigger if exists set_setlist_items_updated_at on public.setlist_items;
create trigger set_setlist_items_updated_at
before update on public.setlist_items
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- dj_packs — a setlist, its files and the show details, sent outward
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.dj_packs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  -- Restrict, unlike the event cascade above: deleting a setlist that has been
  -- sent to someone would break their link with no warning. The app makes the
  -- owner revoke the pack first.
  setlist_id uuid not null references public.setlists(id) on delete restrict,
  -- Opt in (founder call), so null is the normal state. Stored as given: four
  -- digits shared with the whole pack is a courtesy lock, not an identity, and
  -- hashing it would stop the owner reading it back to a DJ over the phone.
  passcode text check (passcode is null or passcode ~ '^[0-9]{4}$'),
  -- Defaults to the show date + 3 days, applied app-side where the event's
  -- date is known.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dj_packs_event_idx
  on public.dj_packs(event_id, created_at desc);

create index if not exists dj_packs_setlist_idx on public.dj_packs(setlist_id);

drop trigger if exists set_dj_packs_updated_at on public.dj_packs;
create trigger set_dj_packs_updated_at
before update on public.dj_packs
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- dj_pack_recipients — one link each, which is what makes receipts work
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.dj_pack_recipients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.dj_packs(id) on delete cascade,
  recipient_name text not null,
  recipient_role text,
  -- 18 random bytes, base64url — the release_epks / release_capture_pages
  -- shape. Unguessable, and the only access control on the public page.
  -- Kept readable (never hashed) because the owner has to copy it into
  -- WhatsApp; the credit and press-kit links make the same trade for the
  -- same reason.
  token text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dj_pack_recipients_pack_idx
  on public.dj_pack_recipients(pack_id, created_at);

drop trigger if exists set_dj_pack_recipients_updated_at on public.dj_pack_recipients;
create trigger set_dj_pack_recipients_updated_at
before update on public.dj_pack_recipients
for each row execute function public.set_updated_at();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- dj_pack_access_log — who opened it, who downloaded what, when
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.dj_pack_access_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.dj_packs(id) on delete cascade,
  -- Set null, with the names denormalized below: this log is the only
  -- deterrent on an unreleased track, so removing a recipient must not erase
  -- the evidence that they downloaded one.
  recipient_id uuid references public.dj_pack_recipients(id) on delete set null,
  song_version_id uuid references public.song_versions(id) on delete set null,
  recipient_name text not null default '',
  song_title text,
  version_label text,
  action public.dj_pack_access_action not null,
  created_at timestamptz not null default now()
);

create index if not exists dj_pack_access_log_pack_idx
  on public.dj_pack_access_log(pack_id, created_at desc);

create index if not exists dj_pack_access_log_recipient_idx
  on public.dj_pack_access_log(recipient_id, created_at desc);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Row level security
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
--
-- Owner-scoped on every table, matching every other owned table in this
-- schema. As with task_outcomes, this is DEFENCE IN DEPTH and not the whole
-- access model: real team access is enforced app-side through the service-role
-- client (see lib/release-access-server.ts for the shape events will follow),
-- because team membership lives in workspace_members and is not expressible
-- here without a join every policy would pay for on every row.
--
-- The public pack page reads through the service-role client by token, exactly
-- as /epk/[token] and /credits/[token] do, so there is deliberately NO public
-- select policy anywhere below. A row is reachable without a session only
-- through a route that resolved an unguessable token first.

alter table public.songs enable row level security;
alter table public.song_versions enable row level security;
alter table public.events enable row level security;
alter table public.event_run_of_show enable row level security;
alter table public.setlists enable row level security;
alter table public.setlist_items enable row level security;
alter table public.dj_packs enable row level security;
alter table public.dj_pack_recipients enable row level security;
alter table public.dj_pack_access_log enable row level security;

-- One `for all` policy per table, matching the release-chain policies in
-- 20260525034856_schema_reconciliation.sql. Written out rather than generated
-- in a loop: these are the security surface, they get audited by eye, and a
-- statement that fails in the Supabase SQL editor should name its own table.

drop policy if exists "Owners manage songs" on public.songs;
create policy "Owners manage songs"
  on public.songs
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage song versions" on public.song_versions;
create policy "Owners manage song versions"
  on public.song_versions
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage events" on public.events;
create policy "Owners manage events"
  on public.events
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage run of show" on public.event_run_of_show;
create policy "Owners manage run of show"
  on public.event_run_of_show
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage setlists" on public.setlists;
create policy "Owners manage setlists"
  on public.setlists
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage setlist items" on public.setlist_items;
create policy "Owners manage setlist items"
  on public.setlist_items
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage dj packs" on public.dj_packs;
create policy "Owners manage dj packs"
  on public.dj_packs
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage dj pack recipients" on public.dj_pack_recipients;
create policy "Owners manage dj pack recipients"
  on public.dj_pack_recipients
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- The access log is READ-ONLY to its owner and writable only by the service
-- role. Every row is written by the public pack route on behalf of someone who
-- has no session at all, and nothing in the product should ever let a signed-in
-- user manufacture or erase a download record — that is the whole point of it.
drop policy if exists "Owners view dj_pack_access_log" on public.dj_pack_access_log;
create policy "Owners view dj_pack_access_log"
  on public.dj_pack_access_log
  for select
  using (owner_user_id = auth.uid());
