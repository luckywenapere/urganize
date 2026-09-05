-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- press_kits — one standing press kit per ARTIST, kept current by the team
--
-- Replaces the release-scoped EPK (release_epks, 2026-07-30). That one is a
-- share token and nothing else: lib/epk-server.ts assembles a kit live from a
-- single release on every request, so the kit goes stale the moment the next
-- release lands and an artist accumulates one link per release. A press kit is
-- not a release artifact. It is a standing document about an artist that press,
-- editors and bookers hold one permanent link to, and that releases and shows
-- flow into as they happen.
--
-- This makes the kit the third object beside Release and Show. Like an event it
-- hangs off the ARTIST, so it reuses the artist-scoped access rule rather than
-- growing its own (see ensureEventAccess in app/api/events/_shared.ts, and the
-- note there about decideReleaseAccess being generic in fact).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIONS WORTH KNOWING BEFORE CHANGING ANY OF THIS
--
-- 1. THE KIT OWNS ITS CONTENT (founder call). `artists` is name and slug and
--    nothing else — no bio, photo, genre, socials, hometown or contact exists
--    anywhere in the schema today, so every field here is net-new rather than
--    a duplicate. It was deliberately NOT promoted onto `artists`: there is no
--    artist-profile surface to edit it from, and a half-built profile only one
--    feature writes to is worse than a contained one. If a second consumer ever
--    wants an artist bio, promote it then, with a migration and a real reader.
--
-- 2. ONE ROW PER SECTION, not one row with twelve content columns and not one
--    jsonb document. The brief needs per-section status, per-section history,
--    reorder and hide, so section state IS the data. This is the
--    team_brief_sections shape, and `section` is a CHECK rather than a Postgres
--    enum for the reason recorded there: the section list is product copy that
--    will change, and `alter type ... add value` cannot run in a transaction.
--
-- 3. DRAFT AND PUBLISHED ARE TWO COLUMNS ON ONE ROW, not a snapshot table.
--    `content` is what the team edits; `published_content` is what /k/{slug}
--    serves. Publishing copies one to the other, and "what changed since the
--    last publish" is a straight comparison of the two. A null
--    `published_content` means that section has never been published and the
--    public page skips it. Editing a live kit cannot change the public page.
--
-- 4. THE SLUG IS GLOBALLY UNIQUE (founder call), because the public kit is
--    meant to be FOUND — someone searching an artist's name plus "press kit"
--    should land on it. That is a real departure: every other public page in
--    apps/web is robots:noindex and reached only by an unguessable token. A
--    per-team namespace would need the team in the URL and would not serve that
--    purpose, so the first team to claim a name holds it and a taken slug is
--    refused at the API.
--
-- 5. press_kit_assets EXISTS BECAUSE `assets` CANNOT HOLD AN ARTIST'S PHOTO.
--    assets_scope_check requires every row to belong to a release or a task,
--    and a standing press photo belongs to neither. Weakening that constraint
--    would degrade it for every existing asset, so this follows song_versions,
--    which was added for exactly this reason. Same bucket, its own path prefix,
--    its own size ceiling (never alias ASSET_SIZE_LIMITS.cover_art — see the
--    warning in lib/asset-constants.ts and the tests that enforce it).
--
-- 6. press_kit_section_versions IS THE FIRST HISTORY TABLE IN THIS SCHEMA, and
--    team_brief_sections explicitly cut one ("NO HISTORY TABLE ... updated_by
--    and updated_at per section are the audit trail people actually ask for").
--    The brief asks for 30 days and one-tap restore per section, so it is built,
--    and the deviation is recorded here rather than left to be rediscovered.
--    Two rules keep it from exploding, both pure and unit-tested app-side: a
--    version is written BEFORE an autosave overwrites content, and it coalesces
--    into the newest row when that row is younger than five minutes and by the
--    same person — otherwise an 800ms debounce writes a row per keystroke.
--    Pruning happens ON WRITE, never on a cron: the Vercel plan caps crons at
--    one a day and both slots are taken.
--
-- 7. DELETE RULES, each deliberate and each different:
--    * artist_id CASCADE — unlike releases.artist_id (RESTRICT) and
--      events.artist_id (RESTRICT), a kit is derived state that is unreachable
--      without its artist, so it must not block deleting one. Note
--      countArtistDeletionBlockers in lib/artists-server.ts counts releases and
--      scoped members only; a kit is deliberately not a blocker.
--    * kit_id CASCADE on every child — a section, a version, a photo and a view
--      record all mean nothing without the kit.
--    * press_kit_events.asset_id SET NULL with a denormalized file name, so the
--      evidence of a download survives the photo being replaced. The
--      dj_pack_access_log rule.
--    * updated_by / saved_by SET NULL — a departing teammate must not delete
--      the section they last touched.
--
-- 8. press_kit_events HAS A SELECT POLICY AND NO WRITE POLICY. Rows are written
--    by the public page on behalf of someone with no session, through the
--    service-role client, and nothing signed in should be able to manufacture
--    or erase a view record. Note what it can and cannot answer: counts,
--    timestamps and per-asset downloads, but never WHO opened the kit. Section
--    2 of the brief fixes one permanent link per artist, which forecloses the
--    per-recipient tokens that make dj_pack_recipients able to answer that.
--
-- RLS below is owner-scoped DEFENCE IN DEPTH and not the whole access model:
-- real team access is enforced app-side through the service-role client (see
-- lib/release-access-server.ts). owner_user_id is denormalized onto every child
-- table so each policy stays a flat comparison rather than an exists() chain —
-- the events migration's shape. There is deliberately NO public select policy
-- anywhere below; the public page reads as service-role.
--
-- ROLLBACK (manual, children first):
--   drop table if exists public.press_kit_events;
--   drop table if exists public.press_kit_assets;
--   drop table if exists public.press_kit_section_versions;
--   drop table if exists public.press_kit_sections;
--   drop table if exists public.press_kits;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.press_kits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  slug text not null
    constraint press_kits_slug_shape_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  state text not null default 'incomplete'
    constraint press_kits_state_check
    check (state in ('incomplete', 'ready', 'published')),
  visibility text not null default 'public'
    constraint press_kits_visibility_check
    check (visibility in ('link_only', 'public', 'public_listed')),
  embargo_date date,
  available_for_interview boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One kit per artist, always. Also the upsert target when the post-plan step
-- reaches for an artist's kit and has to create it.
create unique index if not exists press_kits_artist_id_key
  on public.press_kits(artist_id);

-- The public page's only lookup path, and what makes decision 4 real.
create unique index if not exists press_kits_slug_key
  on public.press_kits(slug);

create index if not exists press_kits_owner_idx
  on public.press_kits(owner_user_id);

create table if not exists public.press_kit_sections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kit_id uuid not null references public.press_kits(id) on delete cascade,
  section text not null
    constraint press_kit_sections_section_check
    check (section in (
      'header', 'bios', 'latest_release', 'music', 'assets', 'video',
      'credits', 'numbers', 'press', 'live', 'contact', 'links'
    )),
  content jsonb not null default '{}'::jsonb,
  published_content jsonb,
  status text not null default 'empty'
    constraint press_kit_sections_status_check
    check (status in ('empty', 'draft', 'ready')),
  -- Where the current content came from. 'user' is what stops autofill and a
  -- release roll-in silently overwriting something a person wrote by hand.
  source text not null default 'autofill'
    constraint press_kit_sections_source_check
    check (source in ('autofill', 'ai', 'user')),
  position smallint not null default 0,
  hidden boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per section per kit. Also the upsert target for every section save.
create unique index if not exists press_kit_sections_kit_section_key
  on public.press_kit_sections(kit_id, section);

-- The kit editor's read path: every section for one kit, in display order.
create index if not exists press_kit_sections_kit_position_idx
  on public.press_kit_sections(kit_id, position);

create table if not exists public.press_kit_section_versions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.press_kit_sections(id) on delete cascade,
  content jsonb not null,
  saved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Both read paths at once: the history list for one section, and the prune.
create index if not exists press_kit_section_versions_section_created_idx
  on public.press_kit_section_versions(section_id, created_at desc);

create table if not exists public.press_kit_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kit_id uuid not null references public.press_kits(id) on delete cascade,
  kind text not null
    constraint press_kit_assets_kind_check
    check (kind in ('press_photo', 'logo')),
  file_name text not null,
  file_size bigint not null default 0,
  mime_type text,
  storage_bucket text not null default 'release-assets',
  storage_path text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  -- Press cannot legally run a photo without these, so they are captured per
  -- file rather than once per kit: different shoots, different photographers.
  photographer_credit text,
  usage_rights text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Storage paths are never reused (they carry a uuid), so this doubles as the
-- guard against two rows pointing at one object. Mirrors assets.
create unique index if not exists press_kit_assets_bucket_path_key
  on public.press_kit_assets(storage_bucket, storage_path);

create index if not exists press_kit_assets_kit_kind_idx
  on public.press_kit_assets(kit_id, kind, position);

create table if not exists public.press_kit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kit_id uuid not null references public.press_kits(id) on delete cascade,
  action text not null
    constraint press_kit_events_action_check
    check (action in ('viewed', 'downloaded_asset', 'downloaded_all')),
  asset_id uuid references public.press_kit_assets(id) on delete set null,
  -- Denormalized so a download record still reads correctly after the photo it
  -- names is replaced or removed.
  asset_file_name text,
  created_at timestamptz not null default now()
);

-- The team's "who is opening this" panel: one kit, newest first.
create index if not exists press_kit_events_kit_created_idx
  on public.press_kit_events(kit_id, created_at desc);

drop trigger if exists set_press_kits_updated_at on public.press_kits;
create trigger set_press_kits_updated_at
before update on public.press_kits
for each row execute function public.set_updated_at();

drop trigger if exists set_press_kit_sections_updated_at on public.press_kit_sections;
create trigger set_press_kit_sections_updated_at
before update on public.press_kit_sections
for each row execute function public.set_updated_at();

drop trigger if exists set_press_kit_assets_updated_at on public.press_kit_assets;
create trigger set_press_kit_assets_updated_at
before update on public.press_kit_assets
for each row execute function public.set_updated_at();

alter table public.press_kits enable row level security;
alter table public.press_kit_sections enable row level security;
alter table public.press_kit_section_versions enable row level security;
alter table public.press_kit_assets enable row level security;
alter table public.press_kit_events enable row level security;

drop policy if exists "Owners manage press kits" on public.press_kits;
create policy "Owners manage press kits"
  on public.press_kits
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage press kit sections" on public.press_kit_sections;
create policy "Owners manage press kit sections"
  on public.press_kit_sections
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage press kit section versions" on public.press_kit_section_versions;
create policy "Owners manage press kit section versions"
  on public.press_kit_section_versions
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners manage press kit assets" on public.press_kit_assets;
create policy "Owners manage press kit assets"
  on public.press_kit_assets
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Select only. See decision 8: nothing signed in writes a view record.
drop policy if exists "Owners view press kit events" on public.press_kit_events;
create policy "Owners view press kit events"
  on public.press_kit_events
  for select
  using (owner_user_id = auth.uid());

do $$
declare
  missing text;
begin
  select string_agg(t, ', ')
    into missing
  from unnest(array[
    'press_kits',
    'press_kit_sections',
    'press_kit_section_versions',
    'press_kit_assets',
    'press_kit_events'
  ]) as t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  );

  if missing is not null then
    raise exception 'press kit tables were not created: %', missing;
  end if;
end $$;
