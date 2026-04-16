# DB Migration: Pre-Save Campaigns

Run this SQL in Supabase SQL Editor to enable artist pre-save links and subscriber capture.

```sql
create extension if not exists pgcrypto;

create table if not exists public.pre_save_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  artist_name text not null,
  release_id uuid null references public.releases(id) on delete set null,
  release_title text not null,
  release_date date null,
  cover_art_url text null,
  streaming_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pre_save_campaigns
  add column if not exists release_id uuid null references public.releases(id) on delete set null;

create index if not exists pre_save_campaigns_user_id_idx
  on public.pre_save_campaigns(user_id);

create index if not exists pre_save_campaigns_release_id_idx
  on public.pre_save_campaigns(release_id);

create index if not exists pre_save_campaigns_created_at_idx
  on public.pre_save_campaigns(created_at desc);

create table if not exists public.pre_save_subscribers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pre_save_campaigns(id) on delete cascade,
  email text not null,
  subscribed_at timestamptz not null default now()
);

create index if not exists pre_save_subscribers_campaign_id_idx
  on public.pre_save_subscribers(campaign_id);

create index if not exists pre_save_subscribers_subscribed_at_idx
  on public.pre_save_subscribers(subscribed_at desc);

create unique index if not exists pre_save_subscribers_campaign_email_unique_idx
  on public.pre_save_subscribers(campaign_id, lower(email));

alter table public.pre_save_campaigns enable row level security;
alter table public.pre_save_subscribers enable row level security;
```
