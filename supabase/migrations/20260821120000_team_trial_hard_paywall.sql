-- Team trial + hard paywall (founder request, 2026-08-21). Replaces open
-- access with a 14-day full-access TEAM trial that ends in a hard wall: past
-- the trial with no paid subscription and no comp, every app route for that
-- team renders the paywall. No permanent free tier, no read-only mode, and
-- nothing is ever deleted or hidden — the wall lifts the moment the team pays,
-- is comped, or has its trial extended.
--
-- WHY THESE COLUMNS LIVE ON workspaces, not profiles:
-- billing has been per-user since it was built (subscriptions.user_id UNIQUE,
-- the trial fields on profiles), and rewiring the money path is high risk for
-- zero benefit. So money rows stay keyed to the OWNER, and the TEAM-level
-- facts — when its trial ends, whether it is comped, what deal it is on — land
-- here. workspaces.owner_id is UNIQUE, so team and owner are 1:1 and the two
-- halves join cleanly. A resolver (apps/web/lib/team-billing-server.ts)
-- combines the owner's subscription snapshot with these fields so every member
-- of a team inherits the owner's access. That inheritance is the thing the
-- paywall always needed and never had: /api/invites/[token] already states the
-- policy in its header ("the inviter's paid status is what authorizes
-- access") — this is where it becomes true.
--
-- Design calls worth recording:
--   * billing_plan is a DEAL MARKER, not an access grant. 'founding' (lifetime
--     price lock) and 'custom' (admin-negotiated rate) describe what the team
--     pays; access still comes from a subscriptions row or comped_at. Keeping
--     those separate means an admin can record a price without accidentally
--     granting free access, and vice versa.
--   * billing_locked_amount is kobo (minor units), matching subscriptions.amount
--     and packages/pricing's minorUnit. Every amount in this system is minor
--     units; nothing multiplies by 100 at a call site.
--   * The protect trigger covers INSERT as well as UPDATE, unlike the profiles
--     precedent it is modelled on. profiles rows are created by an auth trigger,
--     but "Owners manage workspaces" is FOR ALL — an owner without a workspace
--     row could otherwise INSERT their one row with comped_at already set and
--     hand themselves free access forever.
--   * billing_events has RLS enabled and ZERO policies (the
--     scheduled_notifications / workspace_invite_links posture): it is an
--     internal ledger read only by the founder's admin panel through the
--     service-role client. A team must not be able to read, or write, its own
--     billing history.
--   * The backfill starts every existing team's 14 days from the moment this
--     migration is applied, which is what gives the founder a two-week window
--     to convert existing teams personally before anyone is walled. Teams that
--     already pay are unaffected: paid / is_subscribed / allowlisted / promo
--     states all short-circuit BEFORE the trial check in resolveTeamAccess.
--
-- Gated in the app by NEXT_PUBLIC_FEATURE_HARD_PAYWALL (default false), so
-- this migration is safe to apply ahead of the flag: the columns simply sit
-- unread. Applying it IS what starts the clock, though — see the activation
-- checklist in CLAUDE.md.
--
-- ROLLBACK (manual, if ever needed):
--   drop trigger if exists workspaces_protect_billing_fields on public.workspaces;
--   drop function if exists public.prevent_workspace_billing_self_update();
--   drop table if exists public.billing_events;
--   alter table public.workspaces
--     drop column if exists trial_started_at,
--     drop column if exists trial_ends_at,
--     drop column if exists comped_at,
--     drop column if exists comped_by,
--     drop column if exists billing_plan,
--     drop column if exists billing_locked_amount,
--     drop column if exists billing_notes;
--   alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
--   alter table public.subscriptions add constraint subscriptions_plan_check
--     check (plan = any (array['monthly','annual','yearly','access','custom']::text[]));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. Team billing fields on workspaces
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.workspaces
  add column if not exists trial_started_at      timestamptz null,
  add column if not exists trial_ends_at         timestamptz null,
  add column if not exists comped_at             timestamptz null,
  add column if not exists comped_by             uuid        null,
  add column if not exists billing_plan          text        null,
  add column if not exists billing_locked_amount bigint      null,
  add column if not exists billing_notes         text        null;

comment on column public.workspaces.trial_started_at is
  'When this team''s 14-day full-access trial began. Stamped at workspace creation (ensureOwnedWorkspace) or by the 2026-08-21 backfill for teams that predate the feature.';

comment on column public.workspaces.trial_ends_at is
  'When this team''s trial lapses. Past this instant, with no paid owner subscription and no comp, every app route walls. NULL fails OPEN (treated as an active trial) so an unstamped row can never lock a team out.';

comment on column public.workspaces.comped_at is
  'Set by an admin to grant indefinite free access (strategic pilots, partners). A comped team never walls, whatever its trial or subscription says. NULL = not comped.';

comment on column public.workspaces.comped_by is
  'auth.users id of the admin who comped the team. Audit trail only.';

comment on column public.workspaces.billing_plan is
  'Deal marker, NOT an access grant: ''founding'' (lifetime price lock) or ''custom'' (admin-negotiated rate). Access comes from a subscriptions row or comped_at. NULL = standard tiers.';

comment on column public.workspaces.billing_locked_amount is
  'The agreed rate in KOBO (minor units, matching subscriptions.amount), for founding/custom deals. Never displayed on any public surface.';

comment on column public.workspaces.billing_notes is
  'Free-text admin note about the deal (invoice reference, agreement terms, who negotiated it). Internal only.';

alter table public.workspaces drop constraint if exists workspaces_billing_plan_check;
alter table public.workspaces add constraint workspaces_billing_plan_check
  check (billing_plan is null or billing_plan in ('founding', 'custom'));

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. Protect the billing fields from the teams they govern
--
-- "Owners manage workspaces" is FOR ALL using (owner_id = auth.uid()), so
-- without this an owner could extend their own trial or comp themselves
-- straight from the browser with the anon client. Modelled on
-- prevent_profile_trial_self_update (20260528 / extended 20260713), with
-- INSERT coverage added for the reason in the header.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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
         or new.billing_notes is not null then
        raise exception 'workspaces: billing fields can only be set by the service role'
          using errcode = '42501';
      end if;
    else
      if new.trial_started_at      is distinct from old.trial_started_at
         or new.trial_ends_at         is distinct from old.trial_ends_at
         or new.comped_at             is distinct from old.comped_at
         or new.comped_by             is distinct from old.comped_by
         or new.billing_plan          is distinct from old.billing_plan
         or new.billing_locked_amount is distinct from old.billing_locked_amount
         or new.billing_notes         is distinct from old.billing_notes then
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
-- 3. billing_events — the conversion ledger and the founder's alert feed
--
-- One row per billing moment (trial started, wall hit, talk-to-us clicked,
-- payment completed, admin comp...). Two jobs: it is what the founder's
-- notifications are built from, and it is the dedupe ledger those
-- notifications check so nobody gets emailed twice for the same event or
-- spammed by a teammate clicking "notify my admin" repeatedly.
--
-- workspace_id is ON DELETE SET NULL, not CASCADE: if a team is ever deleted,
-- the record that it trialled and did not convert is exactly the history worth
-- keeping. owner_user_id / actor_user_id are plain uuid with no FK for the same
-- reason (an account deletion must not erase the ledger).
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.billing_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid        null references public.workspaces (id) on delete set null,
  owner_user_id uuid        null,
  actor_user_id uuid        null,
  type          text        not null,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.billing_events is
  'Billing/conversion ledger: trial and paywall moments per team. Written only by the service role; read by the founder admin panel and by the dedupe checks behind founder notifications.';

comment on column public.billing_events.type is
  'Event name, free text by design so a new moment needs no migration. Current set: trial_started, trial_extended, trial_ending_soon, paywall_hit, paywall_return_visit, talk_to_us_clicked, notify_admin_sent, checkout_started, checkout_completed, comped, uncomped, founding_assigned, custom_price_set, manually_marked_paid.';

comment on column public.billing_events.actor_user_id is
  'Whoever triggered it: the team member who saw the wall, or the admin who ran the action. Distinct from owner_user_id, which is always the team owner whose subscription governs access.';

comment on column public.billing_events.metadata is
  'Event-specific context (plan viewed, days granted, amount, admin note). Shapes are not enforced; read defensively.';

-- Serves both the admin list and the dedupe lookups ("has this team ever hit
-- the wall?", "when was the last return visit?"), which always filter by
-- workspace and type and want the newest first.
create index if not exists billing_events_workspace_type_created_idx
  on public.billing_events (workspace_id, type, created_at desc);

create index if not exists billing_events_created_idx
  on public.billing_events (created_at desc);

-- Service-role only. Deliberately NO policies (the scheduled_notifications and
-- workspace_invite_links posture): anon/authenticated reads return empty, and
-- there is no path for a team to read or forge its own billing history.
alter table public.billing_events enable row level security;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. Allow the Founding Member tier to be persisted
--
-- subscriptions_plan_check currently allows monthly/annual/yearly/access/custom.
-- 'founding' is the lifetime-price-lock tier, assignable only by an admin.
-- ADD CONSTRAINT has no IF NOT EXISTS, so drop-then-add (the 20260605
-- recurring-billing precedent).
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (
    plan = any (array['monthly', 'annual', 'yearly', 'access', 'custom', 'founding']::text[])
  );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5. Backfill: every existing team gets a fresh 14 days from this moment
--
-- Spec requirement: no team is walled retroactively. Applying this migration
-- starts the clock, giving the founder a two-week window to convert existing
-- teams by hand. Teams that already pay are untouched by the wall regardless of
-- these dates, because paid / is_subscribed / allowlisted / promo states are
-- checked BEFORE the trial in resolveTeamAccess. WHERE trial_ends_at IS NULL
-- keeps this idempotent and stops a re-run from resetting live trials.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

update public.workspaces
   set trial_started_at = coalesce(trial_started_at, now()),
       trial_ends_at    = now() + interval '14 days',
       updated_at       = now()
 where trial_ends_at is null;
