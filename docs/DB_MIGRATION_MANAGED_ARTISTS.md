# DB Migration: Managed Artists

Run this SQL in Supabase SQL Editor to enable manager-side universal artist records.

```sql
create extension if not exists pgcrypto;

create table if not exists public.managed_artists (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  genre text null,
  primary_platform text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_artists_manager_user_id_idx
  on public.managed_artists(manager_user_id);

alter table public.managed_artists enable row level security;
```
