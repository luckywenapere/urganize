-- Native push delivery wiring (mobile push notifications, 2026-08-10). One row
-- per FCM/APNs device registration token. A user can hold many (phone +
-- tablet); a token belongs to exactly one installed app instance, so it is
-- the natural unique key — re-registering the same device upserts, and a
-- device that switches accounts rebinds its token to the new user.
--
-- This is a SEPARATE table from push_subscriptions (Web Push), not a widened
-- version of it: FCM/APNs tokens carry no p256dh/auth keypair, and adding
-- nullable crypto columns to push_subscriptions would poison every existing
-- query and the 404/410 pruning logic in apps/web/lib/push-server.ts. The two
-- tables are fanned out to from the same choke point (sendPushToUsers /
-- sendPushToAllUsers) so callers never know which transport a user's devices
-- use.
--
-- Rows are pruned server-side when a send returns UNREGISTERED / an invalid
-- token (see apps/web/lib/fcm-server.ts).
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.device_push_tokens;
--   alter table public.profiles drop column if exists motivational_nudges;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

-- Owner-scoped, same pattern as push_subscriptions. The API route uses the
-- service-role client anyway; these policies are defense-in-depth for any
-- future browser-side read.
drop policy if exists "device_push_tokens_select_own" on public.device_push_tokens;
create policy "device_push_tokens_select_own" on public.device_push_tokens
  for select using (user_id = auth.uid());

drop policy if exists "device_push_tokens_insert_own" on public.device_push_tokens;
create policy "device_push_tokens_insert_own" on public.device_push_tokens
  for insert with check (user_id = auth.uid());

drop policy if exists "device_push_tokens_update_own" on public.device_push_tokens;
create policy "device_push_tokens_update_own" on public.device_push_tokens
  for update using (user_id = auth.uid());

drop policy if exists "device_push_tokens_delete_own" on public.device_push_tokens;
create policy "device_push_tokens_delete_own" on public.device_push_tokens
  for delete using (user_id = auth.uid());

-- Shared updated_at trigger function already exists (see schema
-- reconciliation migration).
drop trigger if exists set_device_push_tokens_updated_at on public.device_push_tokens;
create trigger set_device_push_tokens_updated_at
  before update on public.device_push_tokens
  for each row execute function public.set_updated_at();

-- Per-user "send me motivational nudges" preference, default ON. Read
-- server-side by the weekly motivational sweep; written from Settings via
-- the anon client under the existing profiles update policy (the BEFORE
-- UPDATE guard trigger only blocks trial/paid fields — see the
-- ask_after_tasks precedent in 20260809120000_task_outcomes.sql).
alter table public.profiles add column if not exists motivational_nudges boolean not null default true;
