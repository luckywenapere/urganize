-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Partnership promo codes
--
-- A shared, guarded promo code grants a fixed free-access window (a partner
-- perk). Redemption reuses the existing trial machinery: the redeem route
-- writes profiles.trial_ends_at = now + free_days via the service role, and
-- resolveSnapshot() branch 3 grants trial access off trial_ends_at > now.
-- No change to the access model is needed.
--
-- Guards: a code can expire (expires_at) and be capped (max_redemptions);
-- redeemed_count is claimed atomically by the redeem route. A per-user marker
-- (profiles.promo_code / promo_redeemed_at) stops one account from consuming
-- multiple cap slots.
--
-- First code: SSS0709 — Urganize × Sound Summer Surge Workshop, 60 days.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.promo_codes (
  code            text primary key,
  label           text,
  free_days       integer     not null,
  max_redemptions integer     null,          -- null = unlimited
  redeemed_count  integer     not null default 0,
  expires_at      timestamptz null,          -- null = never expires
  active          boolean     not null default true,
  created_at      timestamptz not null default now()
);

-- Only the service-role redeem route touches this table. RLS on with no
-- policies => anon/authenticated get nothing; the service role bypasses RLS.
alter table public.promo_codes enable row level security;

comment on table public.promo_codes is
  'Partner/promotional access codes. Read + claimed only by the service-role redeem route (/api/promo/redeem).';

-- Per-user redemption marker (guard state + light attribution).
alter table public.profiles
  add column if not exists promo_code        text        null,
  add column if not exists promo_redeemed_at timestamptz null;

comment on column public.profiles.promo_code is
  'The promo code this account redeemed, if any. Blocks a second redemption per account.';
comment on column public.profiles.promo_redeemed_at is
  'When the promo code was redeemed.';

-- Extend the protective trigger so authenticated/anon callers cannot set the
-- promo marker themselves (only the service role, same posture as trial fields).
create or replace function public.prevent_profile_trial_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
       or new.promo_redeemed_at is distinct from old.promo_redeemed_at then
      raise exception 'profiles: trial/paid/promo fields can only be modified by the service role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- (trigger profiles_protect_trial_fields already bound in
-- 20260528_payment_gating_trial_fields.sql; replacing the function is enough.)

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Atomic claim: increment redeemed_count and check validity + cap in one
-- statement so concurrent redemptions can't over-issue past max_redemptions.
-- Returns the code's free_days + label on a successful claim, nothing when the
-- code is unknown / inactive / expired / fully claimed. Called only by the
-- service-role redeem route; the access grant itself is a separate,
-- trigger-protected write to profiles.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
create or replace function public.claim_promo_code(p_code text)
returns table (free_days integer, label text)
language sql
security definer
set search_path = public
as $$
  update public.promo_codes
     set redeemed_count = redeemed_count + 1
   where code = p_code
     and active
     and (expires_at is null or expires_at > now())
     and (max_redemptions is null or redeemed_count < max_redemptions)
  returning promo_codes.free_days, promo_codes.label;
$$;

revoke execute on function public.claim_promo_code(text) from public, anon, authenticated;
grant execute on function public.claim_promo_code(text) to service_role;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Seed the first partnership code.
--
-- ⚠️ SET BEFORE THE WORKSHOP: max_redemptions (expected headcount + buffer)
-- and expires_at (workshop end + grace). The values below are placeholders;
-- adjust with a follow-up migration when the real numbers are known.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
insert into public.promo_codes (code, label, free_days, max_redemptions, expires_at)
values ('SSS0709', 'Sound Summer Surge Workshop', 60, 300, '2026-09-30T23:59:59Z')
on conflict (code) do nothing;
