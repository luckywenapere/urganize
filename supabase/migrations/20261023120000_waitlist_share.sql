-- Held accounts share a link to move up the line (2026-10-23).
-- A held account (profiles.access_approved_at is null) gets a personal code.
-- Each other account that signs up through /r/<code> is one friend; 3 friends
-- lets the sharer in (see apps/web/lib/waitlist-share.ts). New tables only.

create table if not exists public.waitlist_share_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- One row per friend. referred_id is the primary key: an account can be
-- credited to one sharer, once, ever.
create table if not exists public.waitlist_referrals (
  referred_id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (referred_id <> referrer_id)
);
create index if not exists waitlist_referrals_referrer_idx on public.waitlist_referrals (referrer_id);

-- Service-role routes only.
alter table public.waitlist_share_codes enable row level security;
alter table public.waitlist_referrals enable row level security;

-- Place in line among held accounts: more friends first, then earlier sign-up.
create or replace function public.waitlist_place_in_line(p_user uuid)
returns integer
language sql
stable
as $$
  with held as (
    select p.id, p.created_at,
           (select count(*) from public.waitlist_referrals r where r.referrer_id = p.id) as friends
      from public.profiles p
     where p.access_approved_at is null
  ), me as (select * from held where id = p_user)
  select (1 + (select count(*) from held h, me
                where h.friends > me.friends
                   or (h.friends = me.friends and h.created_at < me.created_at)))::integer
   where exists (select 1 from me);
$$;
