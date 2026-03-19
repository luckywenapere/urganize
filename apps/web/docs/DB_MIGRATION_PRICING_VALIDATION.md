# Pricing Validation Migration

Run this in Supabase SQL Editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.pricing_validation_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  willingness text null check (willingness in ('yes', 'maybe', 'no')),
  price_band text null check (price_band in ('under-5000', '5000-10000', '10000-plus', 'not-sure')),
  notes text not null default '',
  placement text not null default 'dashboard' check (placement in ('onboarding', 'dashboard', 'research')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_validation_responses_user_id_idx
  on public.pricing_validation_responses(user_id);

alter table public.pricing_validation_responses enable row level security;
```
