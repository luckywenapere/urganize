-- Content calendar, Phase A (URG-157): release-tied social content planning.
--
-- Per release, a manager creates one or more content calendars, each bound to
-- a social platform. Multiple calendars per platform are allowed (experiments,
-- or several accounts on the same network), so there is deliberately NO
-- unique (release_id, platform). Each calendar holds dated posts. Planning
-- only: no posting, no platform APIs; "posted" is a manual status.
--
-- Dormant columns ship now so the schema lands once:
--   content_posts.shared_group_id - Phase B sharing fan-out. A shared post is
--     N sibling rows stamped with one group id, at most one row per calendar
--     via the partial unique index below. Null = unique post (the Phase A
--     normal).
--   content_posts.asset_id - Phase B asset picker (link an existing release
--     asset; no new upload path). ON DELETE SET NULL: deleting an asset must
--     never take a planned post with it.
--
-- Integrity backstop: content_calendars carries unique (id, release_id) so
-- content_posts can hold a composite FK (calendar_id, release_id) referencing
-- content_calendars (id, release_id). A post's calendar therefore always
-- belongs to the post's own release; the siblings-same-release invariant is
-- enforced by the database, not just by handler discipline.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.content_posts;
--   drop table if exists public.content_calendars;
--   drop type if exists public.content_post_pillar;
--   drop type if exists public.content_post_format;
--   drop type if exists public.content_post_status;
--   drop type if exists public.social_platform;

do $$ begin
  create type public.social_platform as enum (
    'tiktok',
    'instagram',
    'youtube',
    'x',
    'facebook',
    'snapchat',
    'whatsapp',
    'threads',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.content_post_status as enum ('draft', 'ready', 'posted');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.content_post_format as enum ('video', 'image', 'carousel', 'text', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.content_post_pillar as enum (
    'behind_the_scenes',
    'performance',
    'promo',
    'fan_engagement',
    'announcement',
    'other'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.content_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  platform public.social_platform not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Target for content_posts' composite FK below. Redundant with the primary
-- key for lookups, but required so the FK can carry release_id along with the
-- calendar id.
do $$ begin
  alter table public.content_calendars
    add constraint content_calendars_id_release_id_key unique (id, release_id);
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;

create index if not exists content_calendars_release_id_idx
  on public.content_calendars(release_id);

create index if not exists content_calendars_owner_user_id_idx
  on public.content_calendars(owner_user_id);

drop trigger if exists set_content_calendars_updated_at on public.content_calendars;
create trigger set_content_calendars_updated_at
before update on public.content_calendars
for each row execute function public.set_updated_at();

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id uuid not null,
  release_id uuid not null,
  shared_group_id uuid null,
  scheduled_date date not null,
  title text not null,
  caption text not null default '',
  format public.content_post_format not null default 'video',
  status public.content_post_status not null default 'draft',
  pillar public.content_post_pillar null,
  posted_url text null,
  asset_id uuid null references public.assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_posts_calendar_release_fkey
    foreign key (calendar_id, release_id)
    references public.content_calendars (id, release_id)
    on delete cascade
);

-- The month-grid read path: where calendar_id = X and scheduled_date between.
create index if not exists content_posts_calendar_id_scheduled_date_idx
  on public.content_posts(calendar_id, scheduled_date);

create index if not exists content_posts_release_id_idx
  on public.content_posts(release_id);

create index if not exists content_posts_shared_group_id_idx
  on public.content_posts(shared_group_id)
  where shared_group_id is not null;

-- A shared post lands on a given calendar at most once.
create unique index if not exists content_posts_shared_group_calendar_uq
  on public.content_posts(shared_group_id, calendar_id)
  where shared_group_id is not null;

drop trigger if exists set_content_posts_updated_at on public.content_posts;
create trigger set_content_posts_updated_at
before update on public.content_posts
for each row execute function public.set_updated_at();

alter table public.content_calendars enable row level security;
alter table public.content_posts enable row level security;

-- Owner-scoped RLS, matching every other release child resource. Calendars
-- and posts are visible and editable by the release owner only in v1
-- (workspace-member visibility is a named follow-up, not improvised here).

drop policy if exists "Owners view their content calendars" on public.content_calendars;
create policy "Owners view their content calendars"
  on public.content_calendars
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create content calendars" on public.content_calendars;
create policy "Owners create content calendars"
  on public.content_calendars
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their content calendars" on public.content_calendars;
create policy "Owners update their content calendars"
  on public.content_calendars
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their content calendars" on public.content_calendars;
create policy "Owners delete their content calendars"
  on public.content_calendars
  for delete
  using (owner_user_id = auth.uid());

drop policy if exists "Owners view their content posts" on public.content_posts;
create policy "Owners view their content posts"
  on public.content_posts
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create content posts" on public.content_posts;
create policy "Owners create content posts"
  on public.content_posts
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their content posts" on public.content_posts;
create policy "Owners update their content posts"
  on public.content_posts
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their content posts" on public.content_posts;
create policy "Owners delete their content posts"
  on public.content_posts
  for delete
  using (owner_user_id = auth.uid());
