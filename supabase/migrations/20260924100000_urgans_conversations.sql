-- UrgAns chat history (founder decisions 2026-09-24).
--
-- Saves UrgAns conversations so a reload, the next sign-in or another device
-- can pick a chat back up, and so past chats can be reopened or deleted from a
-- history list. Behind NEXT_PUBLIC_FEATURE_URGANS_HISTORY (default off); every
-- route under /api/urgans/conversations 404s before touching this table when
-- the flag is off. The account data export DOES read it with the flag off, so
-- apply this before merging the code that ships it.
--
-- ── ONE ROW PER CHAT, THE TRANSCRIPT AS A JSON ARRAY ───────────────────────
-- The release_plan_drafts precedent: a document read and written whole. Each
-- save is "the server was at revision R; keep its first K messages; put these
-- after them", applied as ONE conditional update (`where revision = R`), so a
-- save either lands whole or not at all. The revision check is what makes two
-- browser tabs on one chat safe: the side rail mounts the conversation on
-- every page, so two tabs on one chat is a normal path, not an edge case. A
-- refused save is settled in the browser (adopt, resend, reload, or fork into
-- a new chat so neither tab's words are lost) — see
-- apps/web/lib/chappi/conversation-history.ts.
--
-- Rows per message were rejected: ordered by insertion they keep every message
-- but silently interleave two tabs' turns, and nothing notices.
--
-- ── THE ID IS CHOSEN BY THE BROWSER ────────────────────────────────────────
-- A chat exists in the browser before its first save lands, and a save that
-- is retried must hit the same row. So `id` has no default: the browser
-- generates a v4 uuid and the first save inserts it. A retried first save
-- meets the row it already created and is answered as a conflict the browser
-- recognises as "already landed".
--
-- ── PRIVATE TO ITS OWNER ───────────────────────────────────────────────────
-- The Notes precedent: no teammate read path. Every app path is service-role
-- through the routes, which scope every query to the caller; the four owner
-- policies below are defense in depth, exactly as on public.notes.
--
-- ── KEPT UNTIL THE USER DELETES IT ─────────────────────────────────────────
-- No auto-purge. `owner_user_id` cascades from auth.users, so deleting the
-- account removes every chat with it; the data export includes them.
--
-- Rollback:
--   drop table if exists public.urgans_conversations;

create table if not exists public.urgans_conversations (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat'
    check (char_length(title) between 1 and 200),
  messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(messages) = 'array'),
  message_count integer not null default 0 check (message_count >= 0),
  revision integer not null default 0 check (revision >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The history list: newest first, keyset-paged on (last_message_at, id).
create index if not exists urgans_conversations_owner_recent_idx
  on public.urgans_conversations (owner_user_id, last_message_at desc, id desc);

drop trigger if exists set_urgans_conversations_updated_at on public.urgans_conversations;
create trigger set_urgans_conversations_updated_at
before update on public.urgans_conversations
for each row execute function public.set_updated_at();

alter table public.urgans_conversations enable row level security;

drop policy if exists "Owners view their UrgAns chats" on public.urgans_conversations;
create policy "Owners view their UrgAns chats"
  on public.urgans_conversations for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create UrgAns chats" on public.urgans_conversations;
create policy "Owners create UrgAns chats"
  on public.urgans_conversations for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their UrgAns chats" on public.urgans_conversations;
create policy "Owners update their UrgAns chats"
  on public.urgans_conversations for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their UrgAns chats" on public.urgans_conversations;
create policy "Owners delete their UrgAns chats"
  on public.urgans_conversations for delete
  using (owner_user_id = auth.uid());
