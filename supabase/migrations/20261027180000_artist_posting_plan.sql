-- Posting plan (2026-10-27). The content calendar, back in a lighter form: a
-- short list of posts per ARTIST, so it works between releases. Mocks approved
-- by the founder the same day (docs/mocks/content-calendar-artist).
--
-- Four fields a person fills in: what, day, where (optional), who posts. A post
-- can name a release, but does not have to. Planning only: nothing here posts
-- anywhere. The old release-bound tables (content_calendars, content_posts) are
-- left untouched.
--
-- WhatsApp: the person posting can get a nudge on the day ("Post the studio
-- clip today?" Done / Skip), through the same opt-in, quiet hours and one
-- message a day as task chasing.
--
-- Read and written only through the API with the service role, like the
-- WhatsApp tables, so RLS is on with no policies.
--
-- ROLLBACK (manual):
--   alter table public.whatsapp_messages drop column if exists post_id;
--   alter table public.whatsapp_contacts drop column if exists last_post_id;
--   alter table public.whatsapp_settings drop column if exists remind_posts;
--   drop table if exists public.artist_posts;

create table if not exists public.artist_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  release_id uuid references public.releases(id) on delete set null,
  post_day date not null,
  what text not null
    constraint artist_posts_what_check check (char_length(btrim(what)) between 1 and 200),
  platform text
    constraint artist_posts_platform_check check (
      platform is null or platform in ('instagram', 'tiktok', 'x', 'youtube', 'facebook', 'snapchat', 'threads', 'other')
    ),
  -- Who posts. Null means nobody named; the app fills in whoever added it.
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'planned'
    constraint artist_posts_status_check check (status in ('planned', 'done', 'skipped')),
  done_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_posts_workspace_day_idx on public.artist_posts(workspace_id, post_day);
create index if not exists artist_posts_artist_day_idx on public.artist_posts(artist_id, post_day);
create index if not exists artist_posts_owner_day_idx on public.artist_posts(owner_user_id, post_day);

drop trigger if exists set_artist_posts_updated_at on public.artist_posts;
create trigger set_artist_posts_updated_at
before update on public.artist_posts
for each row execute function public.set_updated_at();

alter table public.artist_posts enable row level security;
grant select, insert, update, delete on public.artist_posts to service_role;
revoke all on public.artist_posts from anon, authenticated;

-- WhatsApp: a team switch, the post a "Done" or "Skip" is about, and the post a
-- nudge was for (one nudge per post per day is a database fact).
alter table public.whatsapp_settings
  add column if not exists remind_posts boolean not null default true;

alter table public.whatsapp_contacts
  add column if not exists last_post_id uuid references public.artist_posts(id) on delete set null;

alter table public.whatsapp_messages
  add column if not exists post_id uuid references public.artist_posts(id) on delete set null;

create unique index if not exists whatsapp_messages_post_once
  on public.whatsapp_messages(post_id, chase_day)
  where post_id is not null and chase_day is not null;
