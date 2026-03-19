Run this in Supabase SQL Editor to enable backend draft persistence for major workflows.

```sql
create extension if not exists pgcrypto;

create table if not exists public.ui_state_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null,
  scope text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, draft_key)
);

create index if not exists ui_state_drafts_user_scope_idx
  on public.ui_state_drafts(user_id, scope);

alter table public.ui_state_drafts enable row level security;
```
