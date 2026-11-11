-- One Assistant chat, with a morning brief (#1207, Oyin, 11 Nov 2026).
--
-- The Assistant tab becomes ONE chat per person that never resets: the chat
-- whose id is the person's own user id (apps/web/lib/chappi/home-chat.ts).
-- Every morning at 8am Lagos a brief is written into it, and a push says so.
--
-- ── 1. EARLIER PAGES OF THE ONE CHAT ───────────────────────────────────────
-- A chat that never resets cannot fit one row's caps (500 messages, 1 MB). So
-- when the one chat gets long, its oldest messages move to an "earlier page":
-- an ordinary urgans_conversations row with thread_key = 'main_archive'. The
-- chat's "Show earlier" button reads these newest first. An old free-standing
-- session (the "New session" kind, now retired) is folded in the same way:
-- it becomes one earlier page, headed by its old title and date. Rollout and
-- project chats are untouched (they have their own ids and stay where they are).
--
-- Earlier pages never appear in the chats list and are read only.
--
-- ── 2. A COPY OF EVERY FOLDED SESSION ──────────────────────────────────────
-- Folding rewrites a session into an earlier page and deletes the original
-- row. The original row is copied here first, whole, so nothing is ever lost.
-- Service role only.
--
-- ── 3. ONE BRIEF PER PERSON PER DAY ────────────────────────────────────────
-- morning_briefs is the record and the lock: unique (user_id, brief_date), so
-- two runs of the job can never write two briefs on one morning.
--
-- ── 4. THE OFF SWITCH ──────────────────────────────────────────────────────
-- profiles.morning_brief, default on, Settings → Notifications. Like
-- motivational_nudges, the person writes it on their own row.
--
-- ── 5. THE 8AM JOB ─────────────────────────────────────────────────────────
-- pg_cron calls /api/cron/morning-briefs every 10 minutes from 07:00 to 08:50
-- UTC (08:00 to 09:50 Lagos). Each call writes the briefs still missing for
-- today until its time runs out, so a large batch spreads over several calls
-- and a failed call is picked up by the next. Uses the two Vault secrets the
-- pitch-payments job already created (urganize_app_url, urganize_cron_secret).
--
-- Down:
--   select cron.unschedule(jobid) from cron.job where jobname = 'urganize-morning-briefs';
--   drop table if exists public.morning_briefs;
--   alter table public.profiles drop column if exists morning_brief;
--   -- earlier pages: restore folded sessions from urgans_conversations_folded
--   -- before dropping thread_key, or they stay as earlier pages.

-- 1. Earlier pages.
alter table public.urgans_conversations
  add column if not exists thread_key text;

alter table public.urgans_conversations
  drop constraint if exists urgans_conversations_thread_key_check;
alter table public.urgans_conversations
  add constraint urgans_conversations_thread_key_check
  check (thread_key is null or thread_key = 'main_archive');

create index if not exists urgans_conversations_owner_thread_idx
  on public.urgans_conversations (owner_user_id, thread_key, last_message_at desc, id desc);

-- 2. Copies of folded sessions.
create table if not exists public.urgans_conversations_folded (
  id uuid primary key,
  owner_user_id uuid not null,
  title text,
  messages jsonb,
  message_count integer,
  revision integer,
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  folded_at timestamptz not null default now(),
  folded_into uuid
);
alter table public.urgans_conversations_folded enable row level security;
revoke all on public.urgans_conversations_folded from anon, authenticated;
grant select, insert, update, delete on public.urgans_conversations_folded to service_role;

-- 3. One brief per person per day.
create table if not exists public.morning_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null,
  payload jsonb not null,
  message_id text not null,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, brief_date)
);
create index if not exists morning_briefs_date_idx on public.morning_briefs (brief_date);
alter table public.morning_briefs enable row level security;
drop policy if exists "People read their own morning briefs" on public.morning_briefs;
create policy "People read their own morning briefs"
  on public.morning_briefs for select
  using (user_id = auth.uid());
revoke insert, update, delete on public.morning_briefs from anon, authenticated;
grant select on public.morning_briefs to authenticated;
grant select, insert, update, delete on public.morning_briefs to service_role;

-- 4. The off switch.
alter table public.profiles
  add column if not exists morning_brief boolean not null default true;

-- 5. The 8am job.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'urganize-morning-briefs';

select cron.schedule(
  'urganize-morning-briefs',
  '*/10 7-8 * * *',
  $job$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'urganize_app_url')
             || '/api/cron/morning-briefs',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'urganize_cron_secret')
      ),
      timeout_milliseconds := 58000
    );
  $job$
);
