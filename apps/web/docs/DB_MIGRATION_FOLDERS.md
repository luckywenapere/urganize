# Folders Database Migration

Run the SQL below once in the Supabase SQL editor for the Urganize project before using `/dashboard/folders`.

```sql
create extension if not exists pgcrypto;

do $$ begin
  create type public.folder_item_type as enum ('note', 'link', 'file', 'contact', 'release', 'contract');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text null,
  icon text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.folders
  add column if not exists color text null;
alter table public.folders
  add column if not exists icon text null;
alter table public.folders
  add column if not exists updated_at timestamptz not null default now();

create index if not exists folders_user_id_idx on public.folders(user_id);
create index if not exists folders_updated_at_idx on public.folders(updated_at desc);

create table if not exists public.folder_items (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.folder_item_type not null,
  title text not null,
  content text null,
  url text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.folder_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.folder_items
  add column if not exists updated_at timestamptz not null default now();

create index if not exists folder_items_folder_id_idx on public.folder_items(folder_id, updated_at desc);
create index if not exists folder_items_user_id_idx on public.folder_items(user_id);
create index if not exists folder_items_type_idx on public.folder_items(type);

alter table public.folders enable row level security;
alter table public.folder_items enable row level security;
```
