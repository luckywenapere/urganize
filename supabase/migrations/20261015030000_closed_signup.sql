-- Closed sign-up (invite-only), 2026-10-15. Founder call: "make sure no one can
-- just sign in" while keeping the waitlist, plus a way to let in the people he
-- calls by phone.
--
-- Anyone can still create an auth user (Google creates one before any app code
-- runs, and autoconfirm is on), so the gate is not here: it is in the server,
-- where access is actually granted (requireActiveAccount and
-- ensureOwnedWorkspace, see apps/web/lib/access-gate-server.ts). This file adds
-- the two things that gate reads.
--
-- APPLY BEFORE THE CODE DEPLOYS. Closed sign-up is on in code with no flag, so
-- without the backfill below every existing account would be held.

-- 1. The approval stamp. Set = this account may use the app.
--    access_source says how: existing | admin | invite_link | invite_email |
--    team_invite | founder_seed | allowlist.
alter table public.profiles
  add column if not exists access_approved_at timestamptz,
  add column if not exists access_source text;

-- Every account that exists today is let in. Idempotent.
update public.profiles
   set access_approved_at = coalesce(created_at, now()),
       access_source = 'existing'
 where access_approved_at is null;

-- 2. Founder invites. One row per "Let in": an optional email binding (anyone
--    who signs up with that email is let in) and an optional single-use code
--    behind app.urganize.app/start/<code> (works whatever email they use).
--    The code is stored only as a sha256 hash; the link is shown once.
create table if not exists public.access_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique,
  email text,
  label text,
  waitlist_id integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  constraint access_invites_email_lower check (email is null or email = lower(email))
);

create unique index if not exists access_invites_open_email_idx
  on public.access_invites (email)
  where email is not null and used_at is null and revoked_at is null;

create index if not exists access_invites_created_at_idx
  on public.access_invites (created_at desc);

-- Service role only: RLS on, no policies.
alter table public.access_invites enable row level security;

-- 3. Nobody approves themselves. The client upserts profiles (auth callback),
--    so the existing trial/paid guard is extended to the two new columns.
create or replace function public.prevent_profile_trial_self_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  caller_role text := coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
    ''
  );
begin
  if caller_role = 'authenticated' or caller_role = 'anon' then
    if new.trial_started_at  is distinct from old.trial_started_at
       or new.trial_ends_at    is distinct from old.trial_ends_at
       or new.trial_used       is distinct from old.trial_used
       or new.paid_at          is distinct from old.paid_at
       or new.promo_code       is distinct from old.promo_code
       or new.promo_redeemed_at is distinct from old.promo_redeemed_at
       or new.access_approved_at is distinct from old.access_approved_at
       or new.access_source      is distinct from old.access_source then
      raise exception 'profiles: trial/paid/promo/access fields can only be modified by the service role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
