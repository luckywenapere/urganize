-- Web Push delivery wiring (2026-07-23). One row per browser/device push
-- subscription. A user can hold many (laptop Chrome, phone PWA); an endpoint
-- belongs to exactly one browser profile, so it is the natural unique key —
-- re-subscribing from the same device upserts, and a device that switches
-- accounts rebinds its endpoint to the new user.
--
-- Rows are pruned server-side when a push attempt returns 404/410 (the
-- subscription was revoked or expired), see apps/web/lib/push-server.ts.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Owner-scoped, same pattern as every owned table. The API routes use the
-- service-role client anyway; these policies are defense-in-depth for any
-- future browser-side read.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- Shared updated_at trigger function already exists (see schema
-- reconciliation migration).
drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
