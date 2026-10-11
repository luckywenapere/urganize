-- Talk to UrgAns: one row per voice call (NEXT_PUBLIC_FEATURE_URGANS_REALTIME,
-- default off). The rules live in apps/web/lib/urgans-voice-realtime.ts; the
-- reads and writes in apps/web/lib/urgans-voice-realtime-server.ts; the routes
-- are /api/urgans/voice/{session,tool,tick,speak,hear,end}.
--
-- ADDITIVE. Nothing reads this table unless the flag is on, and with the flag on
-- and this not applied the session route answers 503 ("Voice isn't available")
-- rather than starting a call it could not bill.
--
-- WHAT IT IS FOR:
--   * Billing a call by the SERVER's clock. minutes_billed is how many started
--     minutes have been charged (2 credits each, ledger reason 'voice_minute',
--     written by settleVoiceMinutes in lib/credits/credits-server.ts). Every
--     tick, every tool turn and the end of the call bill whatever has started
--     since, worked out from started_at, never from a number the browser sends.
--   * The caps: 30 minutes per call, 120 minutes per team in 24 hours, summed
--     from this table (voice_sessions_workspace_started_idx).
--   * The spoken confirmation. pending_action is the ONE confirmation-gated
--     action UrgAns proposed during this call. A spoken or tapped "yes" runs
--     exactly this action, never arguments the voice model or the browser
--     supply, which is how the typed flow's confirmation gate survives voice.
--   * Reconciling the flat rate against cost: the token columns are what the
--     realtime model reported (response.done usage), as the browser relayed
--     it. Advisory only, never used to charge.
--
-- RLS: enabled with ONE policy, a member reading their own calls. Every write is
-- the service role from the routes, so there is no insert, update or delete
-- policy for any client role.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.voice_sessions;

create table if not exists public.voice_sessions (
  id                uuid        primary key default gen_random_uuid(),
  workspace_id      uuid        not null references public.workspaces (id) on delete cascade,
  owner_user_id     uuid        null,
  user_id           uuid        not null references auth.users (id) on delete cascade,
  release_id        uuid        null references public.releases (id) on delete set null,
  transport         text        not null,
  model             text        not null,
  status            text        not null default 'active',
  started_at        timestamptz not null default now(),
  last_tick_at      timestamptz null,
  ended_at          timestamptz null,
  end_reason        text        null,
  minutes_billed    integer     not null default 0,
  credits_charged   integer     not null default 0,
  actions_count     integer     not null default 0,
  pending_action    jsonb       null,
  tokens_in_audio   integer     null,
  tokens_out_audio  integer     null,
  tokens_text       integer     null,
  created_at        timestamptz not null default now(),

  constraint voice_sessions_transport_check check (transport in ('realtime', 'cascade')),
  constraint voice_sessions_status_check check (status in ('active', 'ended')),
  constraint voice_sessions_end_reason_check check (
    end_reason is null or end_reason in
      ('user', 'goodbye', 'silence', 'out_of_credits', 'call_cap', 'daily_cap', 'error', 'disconnected', 'expired')
  ),
  constraint voice_sessions_minutes_check check (minutes_billed >= 0 and minutes_billed <= 30),
  constraint voice_sessions_credits_check check (credits_charged >= 0),
  constraint voice_sessions_actions_check check (actions_count >= 0),
  constraint voice_sessions_ended_check check ((status = 'ended') = (ended_at is not null))
);

create index if not exists voice_sessions_workspace_started_idx
  on public.voice_sessions (workspace_id, started_at desc);

create index if not exists voice_sessions_user_started_idx
  on public.voice_sessions (user_id, started_at desc);

alter table public.voice_sessions enable row level security;

drop policy if exists "Members read their own voice calls" on public.voice_sessions;
create policy "Members read their own voice calls"
  on public.voice_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

comment on table public.voice_sessions is
  'Talk to UrgAns voice calls: billed minutes (2 credits each, ledger reason voice_minute), caps, the one pending confirmation, and reported token usage for reconciliation. Written only by the service role.';

comment on column public.voice_sessions.pending_action is
  'The single confirmation-gated UrgAns action proposed during this call ({toolName, args, title, detail}). A spoken or tapped yes runs exactly this. Cleared once run or cancelled.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'voice_sessions_ended_check') then
    raise exception 'voice_sessions_ended_check was not created';
  end if;
end $$;
