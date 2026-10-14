-- The cancel flow (founder-approved, 2026-10-14). Rules in
-- apps/web/lib/cancel-flow.ts; the route is /api/billing/cancel-flow.
--
-- ADDITIVE, IDEMPOTENT, AND SAFE IN EITHER ORDER. Before this runs the flow's
-- context read fails and Settings > Billing keeps the old card-trial cancel
-- control; the paywall reads trial_cancelled_at on its own query, so a missing
-- column reads as "never cancelled" (the wall, as before).
--
-- 1. workspaces (billing fields, service-role only via the self-update guard):
--    * cancel_discount_claimed_at  the "10% off" (3 bonus days). Once per team.
--    * cancel_invite_extension_at  the trial "invite one teammate, +7 days". Once per team.
--    * trial_cancelled_at          the owner cancelled the trial. Once the trial
--                                  ends the team is read-only, not walled.
-- 2. subscriptions (pause; service-role writes only, like pending_plan):
--    * paused_at               when the last pause was asked for. Never cleared:
--                              it is the one-pause-per-6-months guard.
--    * paused_from / paused_until  the pause window. paused_from is the end of
--                              the paid period. Cleared by the daily sweep when
--                              the pause ends.
--    * pause_option            '2w' | '1m' | '2m' | '3m'.
--    * pause_reminder_sent_at  the "your plan comes back soon" email.
-- 3. cancel_flow_events: every screen shown, offer taken or turned down,
--    reason, budget band, feedback text and the final cancel. RLS on: a person
--    may read their own rows; only the service role writes.
--
-- ROLLBACK (manual):
--   drop table if exists public.cancel_flow_events;
--   alter table public.subscriptions
--     drop column if exists paused_at, drop column if exists paused_from,
--     drop column if exists paused_until, drop column if exists pause_option,
--     drop column if exists pause_reminder_sent_at;
--   alter table public.workspaces
--     drop column if exists cancel_discount_claimed_at,
--     drop column if exists cancel_invite_extension_at,
--     drop column if exists trial_cancelled_at;
--   -- and restore prevent_workspace_billing_self_update from
--   -- 20261011120000_share_reward.sql.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. workspaces
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.workspaces
  add column if not exists cancel_discount_claimed_at timestamptz null,
  add column if not exists cancel_invite_extension_at timestamptz null,
  add column if not exists trial_cancelled_at         timestamptz null;

-- Named by the guard below; repeated (no-ops where they exist) so the guard can
-- never name a missing column, whatever order the migrations ran in.
alter table public.workspaces
  add column if not exists legacy_rate_expires_at  timestamptz null,
  add column if not exists share_reward_claimed_at timestamptz null,
  add column if not exists share_reward_kind       text        null,
  add column if not exists paid_bonus_days         integer     not null default 0;

comment on column public.workspaces.cancel_discount_claimed_at is
  'Cancel flow: when the team took the 10% off (3 bonus days). Once per team, ever.';
comment on column public.workspaces.cancel_invite_extension_at is
  'Cancel flow: when a trial team earned 7 more days by inviting a teammate. Once per team, ever.';
comment on column public.workspaces.trial_cancelled_at is
  'Cancel flow: when the owner cancelled the trial. After the trial ends the team is read-only rather than walled.';

create or replace function public.prevent_workspace_billing_self_update()
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
    if tg_op = 'INSERT' then
      if new.trial_started_at is not null
         or new.trial_ends_at is not null
         or new.comped_at is not null
         or new.comped_by is not null
         or new.billing_plan is not null
         or new.billing_locked_amount is not null
         or new.billing_notes is not null
         or new.legacy_rate_expires_at is not null
         or new.share_reward_claimed_at is not null
         or new.share_reward_kind is not null
         or coalesce(new.paid_bonus_days, 0) <> 0
         or new.cancel_discount_claimed_at is not null
         or new.cancel_invite_extension_at is not null
         or new.trial_cancelled_at is not null then
        raise exception 'workspaces: billing fields can only be set by the service role'
          using errcode = '42501';
      end if;
    else
      if new.trial_started_at            is distinct from old.trial_started_at
         or new.trial_ends_at               is distinct from old.trial_ends_at
         or new.comped_at                   is distinct from old.comped_at
         or new.comped_by                   is distinct from old.comped_by
         or new.billing_plan                is distinct from old.billing_plan
         or new.billing_locked_amount       is distinct from old.billing_locked_amount
         or new.billing_notes               is distinct from old.billing_notes
         or new.legacy_rate_expires_at      is distinct from old.legacy_rate_expires_at
         or new.share_reward_claimed_at     is distinct from old.share_reward_claimed_at
         or new.share_reward_kind           is distinct from old.share_reward_kind
         or new.paid_bonus_days             is distinct from old.paid_bonus_days
         or new.cancel_discount_claimed_at  is distinct from old.cancel_discount_claimed_at
         or new.cancel_invite_extension_at  is distinct from old.cancel_invite_extension_at
         or new.trial_cancelled_at          is distinct from old.trial_cancelled_at then
        raise exception 'workspaces: billing fields can only be modified by the service role'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_protect_billing_fields on public.workspaces;
create trigger workspaces_protect_billing_fields
  before insert or update on public.workspaces
  for each row execute function public.prevent_workspace_billing_self_update();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. subscriptions (pause)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscriptions
  add column if not exists paused_at              timestamptz null,
  add column if not exists paused_from            timestamptz null,
  add column if not exists paused_until           timestamptz null,
  add column if not exists pause_option           text        null,
  add column if not exists pause_reminder_sent_at timestamptz null;

alter table public.subscriptions drop constraint if exists subscriptions_pause_option_check;
alter table public.subscriptions add constraint subscriptions_pause_option_check
  check (pause_option is null or pause_option in ('2w', '1m', '2m', '3m'));

alter table public.subscriptions drop constraint if exists subscriptions_pause_window_check;
alter table public.subscriptions add constraint subscriptions_pause_window_check
  check (paused_until is null or paused_from is null or paused_until > paused_from);

create index if not exists subscriptions_paused_until_idx
  on public.subscriptions (paused_until)
  where paused_until is not null;

comment on column public.subscriptions.paused_at is
  'Cancel flow: when the last pause was asked for. Never cleared; at most one pause per 6 months.';
comment on column public.subscriptions.paused_until is
  'Cancel flow: when the pause ends. The Paystack subscription is disabled for the pause; the owner resumes with a normal checkout.';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. cancel_flow_events
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.cancel_flow_events (
  id           uuid        primary key default gen_random_uuid(),
  -- One walk through the flow, minted by the browser when it opens.
  flow_id      uuid        not null,
  workspace_id uuid        null references public.workspaces (id) on delete cascade,
  user_id      uuid        null references auth.users (id) on delete cascade,
  event        text        not null,
  offer        text        null,
  reason       text        null,
  budget_band  text        null,
  text_answer  text        null,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.cancel_flow_events drop constraint if exists cancel_flow_events_event_check;
alter table public.cancel_flow_events add constraint cancel_flow_events_event_check
  check (event in (
    'flow_started', 'offer_shown', 'offer_accepted', 'offer_declined',
    'reason_selected', 'budget_band_selected', 'feedback_given',
    'final_note_given', 'cancelled', 'resumed'
  ));

alter table public.cancel_flow_events drop constraint if exists cancel_flow_events_offer_check;
alter table public.cancel_flow_events add constraint cancel_flow_events_offer_check
  check (offer is null or offer in (
    'discount', 'invite_extension', 'pause', 'budget_switch_plan', 'budget_discounted_plan'
  ));

alter table public.cancel_flow_events drop constraint if exists cancel_flow_events_reason_check;
alter table public.cancel_flow_events add constraint cancel_flow_events_reason_check
  check (reason is null or reason in ('budget', 'break', 'missing_features', 'hard_to_use', 'alternative'));

alter table public.cancel_flow_events drop constraint if exists cancel_flow_events_budget_band_check;
alter table public.cancel_flow_events add constraint cancel_flow_events_budget_band_check
  check (budget_band is null or budget_band in ('low', 'mid', 'high'));

alter table public.cancel_flow_events drop constraint if exists cancel_flow_events_text_answer_check;
alter table public.cancel_flow_events add constraint cancel_flow_events_text_answer_check
  check (text_answer is null or char_length(text_answer) <= 1000);

create index if not exists cancel_flow_events_workspace_idx
  on public.cancel_flow_events (workspace_id, created_at desc);
create index if not exists cancel_flow_events_flow_idx
  on public.cancel_flow_events (flow_id);
create index if not exists cancel_flow_events_event_idx
  on public.cancel_flow_events (event, created_at desc);

alter table public.cancel_flow_events enable row level security;

drop policy if exists "Users read their own cancel flow events" on public.cancel_flow_events;
create policy "Users read their own cancel flow events"
  on public.cancel_flow_events
  for select
  to authenticated
  using (user_id = auth.uid());

-- No insert, update or delete policy: only the service role (the API route)
-- writes, and RLS refuses everyone else.

comment on table public.cancel_flow_events is
  'Cancel flow: one row per screen, offer, answer and final cancel. Written by /api/billing/cancel-flow only.';
