-- Curator pitch payments (2026-09-25).
--
-- Artists pay a per-pitch fee to send a song to a curator's playlist. Each
-- checkout is ONE Paystack transaction with a flat multi-split: every curator's
-- share goes straight to their own Paystack subaccount and the rest to
-- Urganize's main account. Urganize never holds anyone else's money: there is
-- no wallet, no balance, no escrow anywhere in this schema. What an artist buys
-- is a listen and a written reply inside the response window, never a playlist
-- spot, and a missed window refunds the artist automatically.
--
-- Built from the founder's "Curator Payments Build Spec" (Claude Docs,
-- 2026-09-25), with four founder calls taken before building:
--   1. Paid pitching is OPT-IN per curator. A curator with no live price keeps
--      receiving free pitches exactly as before; nothing here changes the free
--      path.
--   2. Solo teams can pitch (no plan gate).
--   3. Missed windows are swept every 15 minutes by Supabase pg_cron (the next
--      migration), with the existing daily Vercel cron as a backstop.
--   4. Built switched off (NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS) against Paystack
--      test keys first.
--
-- Where this departs from the spec's draft SQL, and why:
--   * The spec says "the pitches table". It is playlist_pitches. Paid pitches
--     REUSE its existing statuses rather than adding a parallel set: 'new' and
--     'listened' are "sent, waiting on a reply", 'added' and 'passed' are the
--     Accept and Pass decisions, and curator_reply holds the written feedback.
--     Two statuses are new: 'awaiting_payment' and 'expired'.
--   * Curator ids reference auth.users, like every other curator table, not
--     profiles. Being a curator is the existence of a curator_profiles row.
--   * The spec's team_id is workspace_id plus owner_user_id, matching how the
--     rest of the app scopes a team.
--   * pitch_payments rows are written at SETTLEMENT, one per paid pitch, never
--     at checkout. So there is no 'initialized' or 'failed' payment status: an
--     unpaid checkout is simply a quote that was never settled, and the pitch
--     stays 'awaiting_payment' for the artist to retry.
--   * payment_events dedupes on (event, event_key), not (event, reference).
--     One checkout can be partly refunded several times, one pitch at a time,
--     and every refund.processed carries the SAME transaction reference, so the
--     spec's key would silently drop the second refund. event_key is the
--     reference for a charge and the refund's own id for a refund.
--
-- Five things worth knowing before editing this:
--
--   * MONEY IS KOBO IN BIGINT, everywhere, and a payment row proves its own
--     arithmetic: curator_share_kobo + platform_fee_kobo = price_kobo is a
--     CHECK, and so is recovery_applied_kobo <= curator_share_kobo. Never store
--     a full account number or any card data: Paystack holds those. We keep the
--     last four digits for display and nothing else.
--
--   * SETTLING AND EXPIRING ARE DATABASE FUNCTIONS, and they have to be. Each
--     writes to four or five tables, and a crash half way through must not leave
--     a pitch "sent" with no payment row behind it, or a refund owed with no
--     recovery recorded. PostgREST cannot run several writes in one
--     transaction, so the routes call settle_pitch_quote() and
--     expire_paid_pitch(), each one transaction with row locks. Both are
--     service-role only, the claim_promo_code() precedent.
--
--   * A CURATOR NEVER SEES AN UNPAID PITCH. Their select policy on
--     playlist_pitches now excludes 'awaiting_payment', so even a hand-written
--     PostgREST query with their own token cannot read a pitch nobody has paid
--     for. The API filters it out as well.
--
--   * ARTISTS HAVE NO DIRECT READ OF pitch_quotes OR pitch_payments. Row level
--     security cannot hide a column, and both carry what an artist must never
--     see: a curator's recovery balance, and the share actually sent to them.
--     So the artist side reads through routes that build their payload field by
--     field, and these two tables get no artist policy at all. Curators may read
--     their OWN payment, recovery, strike, pricing and payout rows.
--
--   * WRITES ARE SERVICE-ROLE ONLY on every table here. There is no insert,
--     update or delete policy anywhere in this file, because every write carries
--     an invariant only a route can check: the price band, the name match, the
--     quote total, the response window.
--
-- Down (manual, in order):
--   drop function if exists public.expire_paid_pitch(uuid, timestamptz, int, int);
--   drop function if exists public.settle_pitch_quote(uuid, bigint, text, bigint, timestamptz, jsonb);
--   drop table if exists public.payout_resolve_attempts, public.payment_events,
--     public.curator_strikes, public.curator_recoveries, public.pitch_payments,
--     public.pitch_quotes, public.curator_pricing, public.curator_payout_accounts;
--   alter table public.curator_profiles drop column if exists inbox_paused_at,
--     drop column if exists strikes_reset_at;
--   (then restore the playlist_pitches status/reply checks, index and policy
--    from 20260810100000_playlist_pitching.sql, after deleting any
--    awaiting_payment or expired rows)

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. playlist_pitches: two new statuses, the window, and who paid
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.playlist_pitches
  add column if not exists payment_kind text not null default 'free',
  add column if not exists response_due_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists expired_at timestamptz;

-- The inline checks from 20260810100000 take Postgres's default names.
alter table public.playlist_pitches drop constraint if exists playlist_pitches_status_check;
alter table public.playlist_pitches
  add constraint playlist_pitches_status_check check (status = any (array[
    'new'::text,
    'listened'::text,
    'added'::text,
    'passed'::text,
    'awaiting_payment'::text,
    'expired'::text
  ]));

-- A paid reply is at least 15 words, so the old 200-character cap is too small
-- for it. Free replies keep their one-line limit in the route.
alter table public.playlist_pitches drop constraint if exists playlist_pitches_curator_reply_check;
alter table public.playlist_pitches
  add constraint playlist_pitches_curator_reply_check
  check (curator_reply is null or char_length(curator_reply) <= 2000);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'playlist_pitches_payment_kind_check'
  ) then
    alter table public.playlist_pitches
      add constraint playlist_pitches_payment_kind_check
      check (payment_kind = any (array['free'::text, 'paid'::text]));
  end if;

  -- Only a paid pitch can wait for payment or run out of time.
  if not exists (
    select 1 from pg_constraint where conname = 'playlist_pitches_paid_states_check'
  ) then
    alter table public.playlist_pitches
      add constraint playlist_pitches_paid_states_check
      check (payment_kind = 'paid' or status <> all (array['awaiting_payment'::text, 'expired'::text]));
  end if;
end
$$;

-- One pitch per release per playlist while it is waiting, now counting a pitch
-- that is waiting for PAYMENT too, so an abandoned checkout is reused rather
-- than duplicated.
drop index if exists public.playlist_pitches_one_waiting_per_playlist_key;
create unique index if not exists playlist_pitches_one_waiting_per_playlist_key
  on public.playlist_pitches(release_id, playlist_id)
  where status = any (array['new'::text, 'awaiting_payment'::text]);

-- The 15-minute sweep: paid pitches still waiting on a reply, by deadline.
create index if not exists playlist_pitches_paid_due_idx
  on public.playlist_pitches(response_due_at)
  where payment_kind = 'paid' and status = any (array['new'::text, 'listened'::text]);

drop policy if exists "Curators view pitches sent to them" on public.playlist_pitches;
create policy "Curators view pitches sent to them"
  on public.playlist_pitches
  for select
  using (curator_user_id = auth.uid() and status <> 'awaiting_payment');

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. curator_profiles: the strike pause
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Three missed windows in 90 days pauses the inbox until an admin reviews.
-- strikes_reset_at is set when the admin unpauses, so the strikes that caused
-- the pause do not pause it again on the very next miss.

alter table public.curator_profiles
  add column if not exists inbox_paused_at timestamptz,
  add column if not exists strikes_reset_at timestamptz;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. curator_payout_accounts
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- One Paystack subaccount per verified bank account. The subaccount is created
-- as soon as the account is saved, even when the name needs review: an admin
-- approving later would otherwise need the full account number, which we do
-- not keep. 'needs_review' simply means no money is routed to it yet.
--
-- Changing banks retires the old row and creates a new one. Pitches already
-- paid keep settling to the account that was live when they were charged,
-- because the split was fixed at charge time.

create table if not exists public.curator_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  curator_user_id uuid not null references auth.users(id) on delete cascade,
  bank_code text not null check (char_length(bank_code) between 1 and 20),
  bank_name text not null check (char_length(bank_name) between 1 and 120),
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  resolved_account_name text not null check (char_length(resolved_account_name) between 1 and 200),
  paystack_subaccount_code text check (
    paystack_subaccount_code is null or char_length(paystack_subaccount_code) between 1 and 60
  ),
  status text not null default 'pending' check (status = any (array[
    'pending'::text,
    'needs_review'::text,
    'active'::text,
    'retired'::text,
    'disabled'::text
  ])),
  terms_version text not null check (char_length(terms_version) between 1 and 60),
  terms_accepted_at timestamptz not null default now(),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one current account per curator.
create unique index if not exists curator_payout_accounts_one_current_key
  on public.curator_payout_accounts(curator_user_id)
  where status = any (array['pending'::text, 'needs_review'::text, 'active'::text]);

create index if not exists curator_payout_accounts_review_idx
  on public.curator_payout_accounts(created_at)
  where status = 'needs_review';

drop trigger if exists set_curator_payout_accounts_updated_at on public.curator_payout_accounts;
create trigger set_curator_payout_accounts_updated_at
before update on public.curator_payout_accounts
for each row execute function public.set_updated_at();

alter table public.curator_payout_accounts enable row level security;

drop policy if exists "Curators view their payout accounts" on public.curator_payout_accounts;
create policy "Curators view their payout accounts"
  on public.curator_payout_accounts
  for select
  using (curator_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. curator_pricing
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The curator's price and whether paid pitching is switched on. A price is only
-- ever LIVE when is_live is true AND the payout account is active AND the
-- inbox is not paused; the routes compute that, so turning a bank account off
-- can never leave a stale "live" flag charging artists. The price band is a
-- config value the route enforces, so the database only insists on positive.

create table if not exists public.curator_pricing (
  curator_user_id uuid primary key references auth.users(id) on delete cascade,
  pitch_price_kobo bigint not null check (pitch_price_kobo > 0),
  response_window_hours integer not null default 168 check (response_window_hours between 24 and 720),
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_curator_pricing_updated_at on public.curator_pricing;
create trigger set_curator_pricing_updated_at
before update on public.curator_pricing
for each row execute function public.set_updated_at();

alter table public.curator_pricing enable row level security;

drop policy if exists "Curators view their pricing" on public.curator_pricing;
create policy "Curators view their pricing"
  on public.curator_pricing
  for select
  using (curator_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5. pitch_quotes
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The server's price for one checkout, frozen for 30 minutes. `lines` is the
-- split: one entry per pitch with the curator's subaccount, the price, the
-- share, the fee and any recovery taken off the share. The client never sends
-- a price; everything here is computed from curator_pricing on the server.
--
-- A quote can still be SETTLED after it expires: the artist may open Paystack
-- at minute 29 and pay at minute 31, and money that arrived is honoured as long
-- as its pitches are still waiting for payment. Anything else lands in
-- 'needs_review' for a human.
--
-- payer_user_id and owner_user_id carry no foreign key on purpose: a payment
-- record must outlive the account that made it.

create table if not exists public.pitch_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  owner_user_id uuid not null,
  payer_user_id uuid not null,
  release_id uuid references public.releases(id) on delete set null,
  total_kobo bigint not null check (total_kobo > 0),
  platform_fee_bps integer not null check (platform_fee_bps between 0 and 10000),
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  paystack_reference text not null unique check (char_length(paystack_reference) between 1 and 100),
  paystack_access_code text,
  authorization_url text,
  status text not null default 'open' check (status = any (array[
    'open'::text,
    'checkout_started'::text,
    'paid'::text,
    'needs_review'::text,
    'superseded'::text
  ])),
  review_reason text check (review_reason is null or char_length(review_reason) <= 200),
  artist_terms_version text not null check (char_length(artist_terms_version) between 1 and 60),
  expires_at timestamptz not null,
  paid_at timestamptz,
  paystack_transaction_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pitch_quotes_owner_idx on public.pitch_quotes(owner_user_id, created_at desc);
create index if not exists pitch_quotes_release_idx on public.pitch_quotes(release_id);
create index if not exists pitch_quotes_review_idx
  on public.pitch_quotes(created_at)
  where status = 'needs_review';

drop trigger if exists set_pitch_quotes_updated_at on public.pitch_quotes;
create trigger set_pitch_quotes_updated_at
before update on public.pitch_quotes
for each row execute function public.set_updated_at();

-- No policy: see the header. Artists read quotes through routes.
alter table public.pitch_quotes enable row level security;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6. pitch_payments
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- One row per PAID pitch, written by settle_pitch_quote(). curator_share_kobo
-- is the curator's NOMINAL share (price minus the Urganize fee), which is what
-- the artist's receipt shows. recovery_applied_kobo is the part of that share
-- Urganize kept to clear an earlier missed window, so the curator's bank
-- received curator_share_kobo - recovery_applied_kobo. Artists never see the
-- second number.
--
-- The display fields are denormalized so a receipt and an earnings row survive
-- the pitch, the release or either account being deleted. pitch_id goes null
-- rather than cascading for the same reason.

create table if not exists public.pitch_payments (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid unique references public.playlist_pitches(id) on delete set null,
  quote_id uuid not null references public.pitch_quotes(id) on delete restrict,
  curator_user_id uuid not null,
  payout_account_id uuid references public.curator_payout_accounts(id) on delete set null,
  paystack_subaccount_code text,
  price_kobo bigint not null check (price_kobo > 0),
  curator_share_kobo bigint not null check (curator_share_kobo >= 0),
  platform_fee_kobo bigint not null check (platform_fee_kobo >= 0),
  recovery_applied_kobo bigint not null default 0 check (recovery_applied_kobo >= 0),
  -- A quote reserved more recovery than was still open by the time it settled
  -- (two checkouts racing on one curator). The split already happened, so this
  -- is money for a human to put right, and the founder is alerted.
  recovery_unmatched_kobo bigint not null default 0 check (recovery_unmatched_kobo >= 0),
  paystack_fee_kobo bigint check (paystack_fee_kobo is null or paystack_fee_kobo >= 0),
  paystack_transaction_id bigint,
  paystack_reference text not null,
  status text not null default 'paid' check (status = any (array[
    'paid'::text,
    'refund_pending'::text,
    'refunded'::text,
    'refund_failed'::text
  ])),
  paid_at timestamptz not null,
  refund_reason text check (refund_reason is null or refund_reason = any (array[
    'missed_window'::text,
    'admin'::text
  ])),
  refund_requested_at timestamptz,
  refund_attempts integer not null default 0 check (refund_attempts >= 0),
  refund_last_error text check (refund_last_error is null or char_length(refund_last_error) <= 500),
  paystack_refund_id bigint,
  refunded_at timestamptz,
  song_title text not null default '',
  artist_name text not null default '',
  playlist_name text not null default '',
  curator_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pitch_payments_split_adds_up check (curator_share_kobo + platform_fee_kobo = price_kobo),
  constraint pitch_payments_recovery_within_share check (recovery_applied_kobo <= curator_share_kobo)
);

create index if not exists pitch_payments_curator_idx on public.pitch_payments(curator_user_id, paid_at desc);
create index if not exists pitch_payments_quote_idx on public.pitch_payments(quote_id);
create index if not exists pitch_payments_refund_pending_idx
  on public.pitch_payments(refund_requested_at)
  where status = 'refund_pending';
create index if not exists pitch_payments_refund_id_idx
  on public.pitch_payments(paystack_refund_id)
  where paystack_refund_id is not null;

drop trigger if exists set_pitch_payments_updated_at on public.pitch_payments;
create trigger set_pitch_payments_updated_at
before update on public.pitch_payments
for each row execute function public.set_updated_at();

alter table public.pitch_payments enable row level security;

-- Curators read their own payments. No artist policy: see the header.
drop policy if exists "Curators view their pitch payments" on public.pitch_payments;
create policy "Curators view their pitch payments"
  on public.pitch_payments
  for select
  using (curator_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 7. curator_recoveries
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- A missed window refunds the artist in full, and because the curator's share
-- has usually settled to their bank already, Urganize funds that refund. This
-- row is what the curator owes back: their nominal share. It is cleared by
-- cutting their share on their next paid pitches, oldest debt first.
--
-- One row per refunded payment (unique), so running the expiry twice can never
-- charge a curator twice for one miss.

create table if not exists public.curator_recoveries (
  id uuid primary key default gen_random_uuid(),
  curator_user_id uuid not null,
  source_payment_id uuid not null unique references public.pitch_payments(id) on delete restrict,
  owed_kobo bigint not null check (owed_kobo > 0),
  recovered_kobo bigint not null default 0 check (recovered_kobo >= 0),
  status text not null default 'open' check (status = any (array[
    'open'::text,
    'cleared'::text,
    'written_off'::text
  ])),
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curator_recoveries_within_owed check (recovered_kobo <= owed_kobo)
);

create index if not exists curator_recoveries_open_idx
  on public.curator_recoveries(curator_user_id, created_at)
  where status = 'open';

drop trigger if exists set_curator_recoveries_updated_at on public.curator_recoveries;
create trigger set_curator_recoveries_updated_at
before update on public.curator_recoveries
for each row execute function public.set_updated_at();

alter table public.curator_recoveries enable row level security;

drop policy if exists "Curators view their recoveries" on public.curator_recoveries;
create policy "Curators view their recoveries"
  on public.curator_recoveries
  for select
  using (curator_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 8. curator_strikes
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- One per missed window (unique per pitch, so a re-run cannot double count).

create table if not exists public.curator_strikes (
  id uuid primary key default gen_random_uuid(),
  curator_user_id uuid not null,
  pitch_id uuid not null unique,
  created_at timestamptz not null default now()
);

create index if not exists curator_strikes_curator_idx
  on public.curator_strikes(curator_user_id, created_at desc);

alter table public.curator_strikes enable row level security;

drop policy if exists "Curators view their strikes" on public.curator_strikes;
create policy "Curators view their strikes"
  on public.curator_strikes
  for select
  using (curator_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 9. payment_events
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Every Paystack webhook event that touches pitch payments, recorded BEFORE it
-- is processed. The unique key makes a redelivery harmless: a row that already
-- has processed_at is acknowledged and skipped. A row without it is processed
-- again, which is what lets a failed attempt answer 500 and be retried.
-- Service role only.

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (char_length(event) between 1 and 100),
  event_key text not null check (char_length(event_key) between 1 and 200),
  paystack_reference text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  process_error text check (process_error is null or char_length(process_error) <= 500),
  constraint payment_events_event_key_unique unique (event, event_key)
);

alter table public.payment_events enable row level security;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 10. payout_resolve_attempts
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Resolving an account number returns a real person's name, so an unlimited
-- resolve endpoint is a way to look people up. Ten per curator per hour, counted
-- off this table. Service role only.

create table if not exists public.payout_resolve_attempts (
  id uuid primary key default gen_random_uuid(),
  curator_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists payout_resolve_attempts_recent_idx
  on public.payout_resolve_attempts(curator_user_id, created_at desc);

alter table public.payout_resolve_attempts enable row level security;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 11. settle_pitch_quote(): one transaction from "Paystack says paid" to "sent"
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Called with the VERIFIED Paystack transaction, never with anything a client
-- sent. Idempotent: a second call for a paid quote answers 'already_settled'
-- and writes nothing, so the webhook, the callback page and the daily
-- reconcile can all call it.
--
-- Refuses, and parks the quote in 'needs_review', when the amount or currency
-- does not match the quote to the kobo, or when any of its pitches is no longer
-- waiting for payment. Either way no pitch is sent. A human looks at it.
--
-- p_fee_allocation is {"<pitch id>": <kobo>} — Paystack's fee split across the
-- lines by the route (lib/pitch-payments.ts allocatePaystackFee), recorded for
-- reporting only.

create or replace function public.settle_pitch_quote(
  p_quote_id uuid,
  p_amount_kobo bigint,
  p_currency text,
  p_transaction_id bigint,
  p_paid_at timestamptz,
  p_fee_allocation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.pitch_quotes%rowtype;
  v_line jsonb;
  v_pitch public.playlist_pitches%rowtype;
  v_pitch_ids uuid[] := '{}';
  v_payment_id uuid;
  v_to_recover bigint;
  v_recovery record;
  v_take bigint;
  v_unmatched jsonb := '[]'::jsonb;
  v_window_hours integer;
begin
  select * into v_quote from public.pitch_quotes where id = p_quote_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_quote.status = 'paid' then
    return jsonb_build_object('result', 'already_settled', 'quote_id', v_quote.id);
  end if;

  if v_quote.status = 'needs_review' then
    return jsonb_build_object('result', 'needs_review', 'quote_id', v_quote.id);
  end if;

  if p_currency is distinct from 'NGN' or p_amount_kobo is distinct from v_quote.total_kobo then
    update public.pitch_quotes
       set status = 'needs_review',
           review_reason = 'amount_mismatch',
           paid_at = p_paid_at,
           paystack_transaction_id = p_transaction_id
     where id = v_quote.id;
    return jsonb_build_object(
      'result', 'amount_mismatch',
      'quote_id', v_quote.id,
      'expected_kobo', v_quote.total_kobo,
      'received_kobo', p_amount_kobo,
      'currency', p_currency
    );
  end if;

  -- Every pitch must still be waiting for payment, checked before anything is
  -- written so a refusal leaves no half-settled state behind.
  for v_line in select * from jsonb_array_elements(v_quote.lines) loop
    select * into v_pitch
      from public.playlist_pitches
     where id = (v_line->>'pitch_id')::uuid
     for update;
    if not found or v_pitch.status <> 'awaiting_payment' then
      update public.pitch_quotes
         set status = 'needs_review',
             review_reason = 'pitch_state_changed',
             paid_at = p_paid_at,
             paystack_transaction_id = p_transaction_id
       where id = v_quote.id;
      return jsonb_build_object(
        'result', 'pitch_state_changed',
        'quote_id', v_quote.id,
        'pitch_id', v_line->>'pitch_id'
      );
    end if;
  end loop;

  for v_line in select * from jsonb_array_elements(v_quote.lines) loop
    v_window_hours := coalesce((v_line->>'response_window_hours')::integer, 168);

    select * into v_pitch from public.playlist_pitches where id = (v_line->>'pitch_id')::uuid;

    insert into public.pitch_payments (
      pitch_id,
      quote_id,
      curator_user_id,
      payout_account_id,
      paystack_subaccount_code,
      price_kobo,
      curator_share_kobo,
      platform_fee_kobo,
      recovery_applied_kobo,
      paystack_fee_kobo,
      paystack_transaction_id,
      paystack_reference,
      status,
      paid_at,
      song_title,
      artist_name,
      playlist_name,
      curator_name
    ) values (
      v_pitch.id,
      v_quote.id,
      (v_line->>'curator_user_id')::uuid,
      nullif(v_line->>'payout_account_id', '')::uuid,
      nullif(v_line->>'subaccount_code', ''),
      (v_line->>'price_kobo')::bigint,
      (v_line->>'curator_share_kobo')::bigint,
      (v_line->>'platform_fee_kobo')::bigint,
      coalesce((v_line->>'recovery_applied_kobo')::bigint, 0),
      nullif(p_fee_allocation->>(v_pitch.id::text), '')::bigint,
      p_transaction_id,
      v_quote.paystack_reference,
      'paid',
      p_paid_at,
      v_pitch.song_title,
      v_pitch.artist_name,
      v_pitch.playlist_name,
      coalesce(v_line->>'curator_name', '')
    )
    returning id into v_payment_id;

    update public.playlist_pitches
       set status = 'new',
           response_due_at = p_paid_at + make_interval(hours => v_window_hours)
     where id = v_pitch.id;

    v_pitch_ids := array_append(v_pitch_ids, v_pitch.id);

    -- Clear the curator's oldest open debts with the recovery this line took.
    v_to_recover := coalesce((v_line->>'recovery_applied_kobo')::bigint, 0);
    if v_to_recover > 0 then
      for v_recovery in
        select id, owed_kobo, recovered_kobo
          from public.curator_recoveries
         where curator_user_id = (v_line->>'curator_user_id')::uuid
           and status = 'open'
         order by created_at asc, id asc
         for update
      loop
        exit when v_to_recover <= 0;
        v_take := least(v_to_recover, v_recovery.owed_kobo - v_recovery.recovered_kobo);
        if v_take > 0 then
          update public.curator_recoveries
             set recovered_kobo = recovered_kobo + v_take,
                 status = case when recovered_kobo + v_take >= owed_kobo then 'cleared' else 'open' end,
                 cleared_at = case when recovered_kobo + v_take >= owed_kobo then p_paid_at else cleared_at end
           where id = v_recovery.id;
          v_to_recover := v_to_recover - v_take;
        end if;
      end loop;

      if v_to_recover > 0 then
        update public.pitch_payments
           set recovery_unmatched_kobo = v_to_recover
         where id = v_payment_id;
        v_unmatched := v_unmatched || jsonb_build_object(
          'payment_id', v_payment_id,
          'curator_user_id', v_line->>'curator_user_id',
          'amount_kobo', v_to_recover
        );
      end if;
    end if;
  end loop;

  update public.pitch_quotes
     set status = 'paid',
         paid_at = p_paid_at,
         paystack_transaction_id = p_transaction_id,
         review_reason = null
   where id = v_quote.id;

  return jsonb_build_object(
    'result', 'settled',
    'quote_id', v_quote.id,
    'pitch_ids', to_jsonb(v_pitch_ids),
    'recovery_unmatched', v_unmatched
  );
end;
$$;

revoke execute on function public.settle_pitch_quote(uuid, bigint, text, bigint, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_pitch_quote(uuid, bigint, text, bigint, timestamptz, jsonb)
  to service_role;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 12. expire_paid_pitch(): a missed window, in one transaction
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Takes the pitch out of the curator's inbox, marks the payment refund-pending,
-- records the strike and what the curator owes back, and pauses the inbox on
-- the third strike in the window. It does NOT call Paystack: the route asks for
-- the refund after this commits, and retries a failed one on the next run.
--
-- Conditional on the pitch still waiting AND its deadline having passed, under
-- a row lock, so a curator replying in the last second and the sweep cannot
-- both win. The strike limit and window are passed in, because they are config
-- values (lib/pitch-payments.ts), not constants of this schema.

create or replace function public.expire_paid_pitch(
  p_pitch_id uuid,
  p_now timestamptz,
  p_strike_limit integer,
  p_strike_window_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pitch public.playlist_pitches%rowtype;
  v_payment public.pitch_payments%rowtype;
  v_paused_at timestamptz;
  v_reset_at timestamptz;
  v_since timestamptz;
  v_strikes integer := 0;
  v_paused boolean := false;
begin
  select * into v_pitch from public.playlist_pitches where id = p_pitch_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_pitch.payment_kind <> 'paid'
     or v_pitch.status <> all (array['new'::text, 'listened'::text])
     or v_pitch.response_due_at is null
     or v_pitch.response_due_at > p_now then
    return jsonb_build_object('result', 'not_due', 'status', v_pitch.status);
  end if;

  select * into v_payment from public.pitch_payments where pitch_id = p_pitch_id for update;
  if not found then
    return jsonb_build_object('result', 'no_payment');
  end if;

  update public.playlist_pitches
     set status = 'expired',
         expired_at = p_now
   where id = p_pitch_id;

  update public.pitch_payments
     set status = 'refund_pending',
         refund_reason = 'missed_window',
         refund_requested_at = p_now
   where id = v_payment.id
     and status = 'paid';

  insert into public.curator_strikes (curator_user_id, pitch_id, created_at)
  values (v_pitch.curator_user_id, p_pitch_id, p_now)
  on conflict (pitch_id) do nothing;

  if v_payment.curator_share_kobo > 0 then
    insert into public.curator_recoveries (curator_user_id, source_payment_id, owed_kobo, created_at, updated_at)
    values (v_pitch.curator_user_id, v_payment.id, v_payment.curator_share_kobo, p_now, p_now)
    on conflict (source_payment_id) do nothing;
  end if;

  select inbox_paused_at, strikes_reset_at
    into v_paused_at, v_reset_at
    from public.curator_profiles
   where user_id = v_pitch.curator_user_id
   for update;

  v_since := greatest(
    p_now - make_interval(days => p_strike_window_days),
    coalesce(v_reset_at, '-infinity'::timestamptz)
  );

  select count(*) into v_strikes
    from public.curator_strikes
   where curator_user_id = v_pitch.curator_user_id
     and created_at > v_since;

  if v_strikes >= p_strike_limit and v_paused_at is null then
    update public.curator_profiles
       set inbox_paused_at = p_now
     where user_id = v_pitch.curator_user_id;
    v_paused := true;
  end if;

  return jsonb_build_object(
    'result', 'expired',
    'payment_id', v_payment.id,
    'price_kobo', v_payment.price_kobo,
    'curator_share_kobo', v_payment.curator_share_kobo,
    'curator_user_id', v_pitch.curator_user_id,
    'strike_count', v_strikes,
    'paused', v_paused
  );
end;
$$;

revoke execute on function public.expire_paid_pitch(uuid, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.expire_paid_pitch(uuid, timestamptz, integer, integer)
  to service_role;
