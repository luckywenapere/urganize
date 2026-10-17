-- =============================================================================
-- Pitch on credits (URG-345, Phase 1, Oct 17, 2026)
-- =============================================================================
--
-- A pitch to a curator is paid from the team's ONE credit balance (plan
-- allowance, top-up packs and trial all count), instead of a Paystack checkout
-- per pitch. Founder decisions, Oct 17, 2026; the full model is in
-- apps/web/lib/pitch-credits.ts.
--
-- ADDITIVE AND NON-DESTRUCTIVE. Nothing is dropped or rewritten:
--   1. curator_playlists.credit_price   integer, default 0 (Free). Every
--      existing playlist reads Free, so nothing is charged until an admin sets
--      a tier. The allowed tiers (0 / 100 / 250) are config in the app; the
--      check here is only a sane range, so a tier change is not a migration.
--   2. playlist_pitches.credits_charged integer, default 0.
--   3. playlist_pitches.payment_kind accepts 'credits' beside 'free' and
--      'paid', and a 'credits' pitch may be 'expired' (refunded) like a paid
--      one. Both checks are re-created with the old values still allowed.
--   4. curator_earnings: what a curator is owed for an on-time reply (₦10 a
--      credit), one row per pitch, written by a trigger. Payouts are Phase 2;
--      nothing here moves money.
--   5. send_credit_pitches(): checks the balance and writes the pitches and
--      their ledger spend rows in ONE transaction, under a per-team lock.
--   6. expire_credit_pitch(): the 7-day sweep's step. Refunds the credits to
--      the same sources they came from, marks the pitch expired and adds the
--      strike (pausing the inbox at 3 in 90 days, the expire_paid_pitch rule).
--
-- Ledger keys: spend:pitch:<pitch id>:<source> and refund:pitch:<pitch id>:<source>
-- on credit_ledger's existing unique dedupe_key, so a retried send or a
-- re-run sweep can never charge or refund twice.
--
-- Rollback (only if nothing was sent with it):
--   drop trigger if exists playlist_pitches_credit_earning on public.playlist_pitches;
--   drop function if exists public.record_credit_pitch_earning();
--   drop function if exists public.expire_credit_pitch(uuid, timestamptz, integer, integer);
--   drop function if exists public.send_credit_pitches(uuid, uuid, uuid, text, timestamptz, integer, integer, jsonb);
--   drop table if exists public.curator_earnings;
--   (the two columns and the widened checks are harmless to keep)
-- =============================================================================

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. The tier on a playlist
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.curator_playlists
  add column if not exists credit_price integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'curator_playlists_credit_price_check') then
    alter table public.curator_playlists
      add constraint curator_playlists_credit_price_check check (credit_price >= 0 and credit_price <= 10000);
  end if;
end
$$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. What a pitch cost, and the 'credits' kind
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.playlist_pitches
  add column if not exists credits_charged integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'playlist_pitches_credits_charged_check') then
    alter table public.playlist_pitches
      add constraint playlist_pitches_credits_charged_check check (credits_charged >= 0);
  end if;
end
$$;

alter table public.playlist_pitches drop constraint if exists playlist_pitches_payment_kind_check;
alter table public.playlist_pitches
  add constraint playlist_pitches_payment_kind_check
  check (payment_kind = any (array['free'::text, 'paid'::text, 'credits'::text]));

-- A paid pitch may wait for payment or run out of time; a credits pitch may run
-- out of time (it is charged before it exists, so it never waits for payment).
alter table public.playlist_pitches drop constraint if exists playlist_pitches_paid_states_check;
alter table public.playlist_pitches
  add constraint playlist_pitches_paid_states_check
  check (
    payment_kind = 'paid'
    or (payment_kind = 'credits' and status <> 'awaiting_payment')
    or status <> all (array['awaiting_payment'::text, 'expired'::text])
  );

-- The sweep: credits pitches still waiting on a reply, by deadline.
create index if not exists playlist_pitches_credits_due_idx
  on public.playlist_pitches(response_due_at)
  where payment_kind = 'credits' and status = any (array['new'::text, 'listened'::text]);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. curator_earnings (Phase 1: recorded only, never paid from here)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- One row per pitch answered on time. pitch_id is not a foreign key: a money
-- record outlives the pitch, the credit_ledger precedent. RLS on; a curator may
-- read their own rows, every write is the trigger below or the service role.

create table if not exists public.curator_earnings (
  id               uuid primary key default gen_random_uuid(),
  curator_user_id  uuid not null,
  pitch_id         uuid not null unique,
  playlist_id      uuid null,
  credits          integer not null check (credits > 0),
  amount_kobo      bigint not null check (amount_kobo > 0),
  status           text not null default 'due' check (status in ('due', 'paid', 'void')),
  created_at       timestamptz not null default now()
);

create index if not exists curator_earnings_curator_idx
  on public.curator_earnings(curator_user_id, created_at desc);

alter table public.curator_earnings enable row level security;

drop policy if exists "Curators view their earnings" on public.curator_earnings;
create policy "Curators view their earnings"
  on public.curator_earnings
  for select
  using (curator_user_id = auth.uid());

-- An on-time reply to a credits pitch earns ₦10 a credit. A trigger rather than
-- a second write in the route, so the earning lands in the same transaction as
-- the reply and no path that records a reply can forget it. "On time" is the
-- reply route's conditional write (responded_at before response_due_at); the
-- trigger checks it again.
create or replace function public.record_credit_pitch_earning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_kind = 'credits'
     and new.credits_charged > 0
     and new.responded_at is not null
     and old.responded_at is null
     and new.response_due_at is not null
     and new.responded_at <= new.response_due_at
     and new.status = any (array['added'::text, 'passed'::text]) then
    insert into public.curator_earnings (curator_user_id, pitch_id, playlist_id, credits, amount_kobo)
    values (new.curator_user_id, new.id, new.playlist_id, new.credits_charged, new.credits_charged::bigint * 1000)
    on conflict (pitch_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.record_credit_pitch_earning() from public, anon, authenticated;

drop trigger if exists playlist_pitches_credit_earning on public.playlist_pitches;
create trigger playlist_pitches_credit_earning
  after update of responded_at on public.playlist_pitches
  for each row execute function public.record_credit_pitch_earning();

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. send_credit_pitches(): charge and create in one transaction
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- p_pitches is a JSON array, one object per playlist:
--   { playlist_id, release_id, release_owner_id, pitcher_name, song_title,
--     artist_name, song_url, song_platform, note, curator_name }
-- The PRICE is never taken from the caller: it is read from curator_playlists
-- here, under a share lock, so the charge is what the tier says at this moment.
--
-- Idempotent by p_request: each pitch id is md5(request || playlist) as a uuid,
-- so a double tap or a retry with the same request finds its pitches already
-- there and charges nothing more. The ledger keys back that up.
--
-- Results (jsonb.result):
--   sent          { pitch_ids, charged, balance_after, replayed }
--   insufficient  { needed, balance, short }    nothing written
--   at_limit      { waiting, limit }            nothing written
--   duplicate     { playlist_id }               a pitch to that playlist is already waiting
--   not_found     { playlist_id }               playlist gone
--   paused        { playlist_id }               curator inbox paused
create or replace function public.send_credit_pitches(
  p_workspace uuid,
  p_owner_user_id uuid,
  p_actor_user_id uuid,
  p_request text,
  p_now timestamptz,
  p_reply_days integer,
  p_waiting_limit integer,
  p_pitches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_pitch_id uuid;
  v_playlist public.curator_playlists%rowtype;
  v_paused timestamptz;
  v_price integer;
  v_total integer := 0;
  v_trial bigint;
  v_allowance bigint;
  v_topup bigint;
  v_balance bigint;
  v_take integer;
  v_left integer;
  v_source text;
  v_ids uuid[] := array[]::uuid[];
  v_new_count integer := 0;
  v_replayed integer := 0;
  v_waiting integer;
  v_release uuid;
  v_new jsonb := '[]'::jsonb;
  v_entry jsonb;
begin
  if p_workspace is null or coalesce(p_request, '') = '' then
    raise exception 'send_credit_pitches: workspace and request are required';
  end if;
  if jsonb_typeof(p_pitches) <> 'array' or jsonb_array_length(p_pitches) = 0 then
    raise exception 'send_credit_pitches: no pitches';
  end if;

  -- One send at a time per team, so two sends can never both pass the balance
  -- check. Scoped to the transaction.
  perform pg_advisory_xact_lock(hashtext('credit_balance:' || p_workspace::text));

  -- Price every playlist and find what is new.
  for v_item in select * from jsonb_array_elements(p_pitches) loop
    v_pitch_id := md5(p_request || ':' || (v_item->>'playlist_id'))::uuid;

    if exists (select 1 from public.playlist_pitches where id = v_pitch_id) then
      v_ids := v_ids || v_pitch_id;
      v_replayed := v_replayed + 1;
      continue;
    end if;

    select * into v_playlist
      from public.curator_playlists
     where id = (v_item->>'playlist_id')::uuid
     for share;
    if not found then
      return jsonb_build_object('result', 'not_found', 'playlist_id', v_item->>'playlist_id');
    end if;

    select inbox_paused_at into v_paused
      from public.curator_profiles
     where user_id = v_playlist.curator_user_id;
    if v_paused is not null then
      return jsonb_build_object('result', 'paused', 'playlist_id', v_playlist.id);
    end if;

    v_price := greatest(coalesce(v_playlist.credit_price, 0), 0);
    v_total := v_total + v_price;
    v_new := v_new || jsonb_build_array(v_item || jsonb_build_object(
      'pitch_id', v_pitch_id,
      'price', v_price,
      'curator_user_id', v_playlist.curator_user_id,
      'playlist_name', v_playlist.name
    ));
  end loop;

  -- Everything was already sent: a replay.
  if jsonb_array_length(v_new) = 0 then
    select coalesce(trial, 0), coalesce(allowance, 0), coalesce(topup, 0)
      into v_trial, v_allowance, v_topup
      from public.credit_balances(p_workspace);
    return jsonb_build_object(
      'result', 'sent',
      'pitch_ids', to_jsonb(v_ids),
      'charged', 0,
      'balance_after', greatest(v_trial, 0) + greatest(v_allowance, 0) + greatest(v_topup, 0),
      'replayed', v_replayed
    );
  end if;

  -- The waiting cap per rollout (status 'new'), counted under the same lock.
  for v_release in
    select distinct (e->>'release_id')::uuid from jsonb_array_elements(v_new) e
  loop
    select count(*) into v_waiting
      from public.playlist_pitches
     where release_id = v_release and status = 'new';
    select count(*) into v_new_count
      from jsonb_array_elements(v_new) e
     where (e->>'release_id')::uuid = v_release;
    if v_waiting + v_new_count > p_waiting_limit then
      return jsonb_build_object('result', 'at_limit', 'waiting', v_waiting, 'limit', p_waiting_limit);
    end if;
  end loop;

  -- The balance, read under the lock.
  select coalesce(trial, 0), coalesce(allowance, 0), coalesce(topup, 0)
    into v_trial, v_allowance, v_topup
    from public.credit_balances(p_workspace);
  v_trial := greatest(v_trial, 0);
  v_allowance := greatest(v_allowance, 0);
  v_topup := greatest(v_topup, 0);
  v_balance := v_trial + v_allowance + v_topup;

  if v_total > v_balance then
    return jsonb_build_object('result', 'insufficient', 'needed', v_total, 'balance', v_balance,
                              'short', v_total - v_balance);
  end if;

  begin
    for v_entry in select * from jsonb_array_elements(v_new) loop
      v_pitch_id := (v_entry->>'pitch_id')::uuid;
      v_price := (v_entry->>'price')::integer;

      insert into public.playlist_pitches (
        id, release_id, owner_user_id, created_by, pitcher_name, curator_user_id,
        playlist_id, playlist_name, song_title, artist_name, song_url, song_platform,
        note, status, payment_kind, credits_charged, response_due_at
      ) values (
        v_pitch_id,
        (v_entry->>'release_id')::uuid,
        (v_entry->>'release_owner_id')::uuid,
        p_actor_user_id,
        v_entry->>'pitcher_name',
        (v_entry->>'curator_user_id')::uuid,
        (v_entry->>'playlist_id')::uuid,
        v_entry->>'playlist_name',
        v_entry->>'song_title',
        v_entry->>'artist_name',
        v_entry->>'song_url',
        nullif(v_entry->>'song_platform', ''),
        coalesce(v_entry->>'note', ''),
        'new',
        case when v_price > 0 then 'credits' else 'free' end,
        v_price,
        case when v_price > 0 then p_now + make_interval(days => p_reply_days) else null end
      );

      -- Draw the price: trial first, then the allowance, then the top-up pool.
      v_left := v_price;
      foreach v_source in array array['trial', 'allowance', 'topup'] loop
        exit when v_left <= 0;
        if v_source = 'trial' then
          v_take := least(v_left, v_trial); v_trial := v_trial - v_take;
        elsif v_source = 'allowance' then
          v_take := least(v_left, v_allowance); v_allowance := v_allowance - v_take;
        else
          v_take := least(v_left, v_topup); v_topup := v_topup - v_take;
        end if;
        if v_take > 0 then
          insert into public.credit_ledger (
            workspace_id, owner_user_id, actor_user_id, pool, kind, credits, dedupe_key, metadata
          ) values (
            p_workspace, p_owner_user_id, p_actor_user_id, v_source, 'spend', -v_take,
            'spend:pitch:' || v_pitch_id::text || ':' || v_source,
            jsonb_build_object(
              'reason', 'pitch',
              'pitch_id', v_pitch_id,
              'curator_name', coalesce(v_entry->>'curator_name', ''),
              'playlist_name', coalesce(v_entry->>'playlist_name', ''),
              'song_title', coalesce(v_entry->>'song_title', ''),
              'charge_credits', v_price
            )
          );
          v_left := v_left - v_take;
        end if;
      end loop;

      v_ids := v_ids || v_pitch_id;
    end loop;
  exception
    when unique_violation then
      -- One waiting pitch per playlist per rollout (the partial unique index),
      -- or a ledger key already used. Everything in this block is undone.
      return jsonb_build_object('result', 'duplicate', 'detail', sqlerrm);
  end;

  return jsonb_build_object(
    'result', 'sent',
    'pitch_ids', to_jsonb(v_ids),
    'charged', v_total,
    'balance_after', v_balance - v_total,
    'replayed', v_replayed
  );
end;
$$;

revoke execute on function public.send_credit_pitches(uuid, uuid, uuid, text, timestamptz, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.send_credit_pitches(uuid, uuid, uuid, text, timestamptz, integer, integer, jsonb)
  to service_role;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5. expire_credit_pitch(): credits back + a strike
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Row-locked like expire_paid_pitch, so a curator replying in the last second
-- and the sweep cannot both win: the reply route's write requires the pitch to
-- still be waiting and before its deadline, and so does this.
create or replace function public.expire_credit_pitch(
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
  v_spend record;
  v_refunded integer := 0;
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

  if v_pitch.payment_kind <> 'credits'
     or v_pitch.status <> all (array['new'::text, 'listened'::text])
     or v_pitch.responded_at is not null
     or v_pitch.response_due_at is null
     or v_pitch.response_due_at > p_now then
    return jsonb_build_object('result', 'not_due', 'status', v_pitch.status);
  end if;

  update public.playlist_pitches
     set status = 'expired',
         expired_at = p_now
   where id = p_pitch_id;

  -- Give back exactly what was taken, to the source it was taken from.
  for v_spend in
    select workspace_id, owner_user_id, pool, credits, metadata
      from public.credit_ledger
     where dedupe_key like 'spend:pitch:' || p_pitch_id::text || ':%'
       and kind = 'spend'
  loop
    insert into public.credit_ledger (
      workspace_id, owner_user_id, actor_user_id, pool, kind, credits, dedupe_key, metadata
    ) values (
      v_spend.workspace_id, v_spend.owner_user_id, null, v_spend.pool, 'refund', -v_spend.credits,
      'refund:pitch:' || p_pitch_id::text || ':' || v_spend.pool,
      coalesce(v_spend.metadata, '{}'::jsonb) || jsonb_build_object('reason', 'pitch', 'refund_reason', 'missed_window')
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    if found then
      v_refunded := v_refunded + (-v_spend.credits);
    end if;
  end loop;

  insert into public.curator_strikes (curator_user_id, pitch_id, created_at)
  values (v_pitch.curator_user_id, p_pitch_id, p_now)
  on conflict (pitch_id) do nothing;

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
    'credits_refunded', v_refunded,
    'curator_user_id', v_pitch.curator_user_id,
    'created_by', v_pitch.created_by,
    'strike_count', v_strikes,
    'paused', v_paused
  );
end;
$$;

revoke execute on function public.expire_credit_pitch(uuid, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.expire_credit_pitch(uuid, timestamptz, integer, integer)
  to service_role;

-- Prove the new shape exists, so a partial application fails here.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'curator_playlists' and column_name = 'credit_price'
  ) then
    raise exception 'curator_playlists.credit_price was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'playlist_pitches' and column_name = 'credits_charged'
  ) then
    raise exception 'playlist_pitches.credits_charged was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'send_credit_pitches') then
    raise exception 'send_credit_pitches was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'expire_credit_pitch') then
    raise exception 'expire_credit_pitch was not created';
  end if;
end
$$;
