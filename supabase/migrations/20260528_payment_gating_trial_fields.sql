-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Payment gating: trial + paid_at fields on profiles
--
-- Adds the four fields needed to express the four-state account access model
-- (unpaid | trial | paid | expired) on top of the existing subscriptions table.
--
-- - trial_started_at / trial_ends_at / trial_used carry the one-time 28-day
--   trial (the *trial_used* flag is what guarantees a trial can never be
--   reclaimed once consumed, even if the trial row is wiped).
-- - paid_at marks the most-recent paid activation. We derive `paid` and
--   `expired` from the existing subscriptions.status + expires_at; paid_at
--   exists for product UX ("paid on …") and analytics, not for gating.
--
-- A protective BEFORE UPDATE trigger blocks PostgREST `authenticated`/`anon`
-- callers from setting these fields themselves. Only the service role
-- (used by /api/trial/start and /api/webhooks/paystack) may modify them.
-- The trigger lets raw postgres connections through so this migration and
-- future admin SQL can backfill without surprise.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.profiles
  add column if not exists trial_started_at timestamptz null,
  add column if not exists trial_ends_at    timestamptz null,
  add column if not exists trial_used       boolean     not null default false,
  add column if not exists paid_at          timestamptz null;

-- Backfill paid_at for existing subscribers from their subscription start.
-- Idempotent (only fills NULLs).
update public.profiles p
set paid_at = s.started_at
from public.subscriptions s
where s.user_id = p.id
  and p.is_subscribed = true
  and p.paid_at is null
  and s.started_at is not null;

-- Protective trigger
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
    if new.trial_started_at is distinct from old.trial_started_at
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.trial_used    is distinct from old.trial_used
       or new.paid_at       is distinct from old.paid_at then
      raise exception 'profiles: trial/paid fields can only be modified by the service role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_trial_fields on public.profiles;
create trigger profiles_protect_trial_fields
before update on public.profiles
for each row
execute function public.prevent_profile_trial_self_update();

comment on column public.profiles.trial_started_at is
  'When the 28-day trial was claimed. Single-use per account.';
comment on column public.profiles.trial_ends_at is
  'When the active trial ends (set to claim time + 28 days).';
comment on column public.profiles.trial_used is
  'True once the trial has been claimed; prevents reclaim.';
comment on column public.profiles.paid_at is
  'When the account most recently paid for access (UX/analytics; gating uses subscriptions).';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Allow subscriptions.plan = 'access' for the flat-tier ₦15,000 SKU credited
-- by the Paystack webhook when no payments row matches the reference (the
-- standalone Paystack Payment Page used by the /locked page).
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan = any (array['monthly'::text, 'yearly'::text, 'access'::text]));

