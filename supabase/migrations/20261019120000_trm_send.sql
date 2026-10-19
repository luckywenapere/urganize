-- =============================================================================
-- Send to TRM (URG-392, Oct 19, 2026)
-- =============================================================================
--
-- ADDITIVE AND NON-DESTRUCTIVE. Two new tables, nothing existing is altered.
--
--   1. distribution_submissions: one row per rollout per distributor (partner
--      'trm' today). Holds TRM's release id, where it stands (TRM's lifecycle
--      statuses plus our own preparing / needs_account / waitlisted), its status
--      history, the artist's TRM email, the team's rights & policy choices, the
--      asset ids at TRM, and what TRM issued (UPC/ISRC). Teammates read the same
--      row, so everyone sees the same status.
--   2. partner_webhook_deliveries: every TRM webhook delivery, verified or not.
--      Verified rows are keyed by TRM's delivery id, so a replay is a no-op
--      (primary key). Refused rows get a generated id and keep the header
--      names and a capped body, so the undocumented payload can be read later.
--
-- Both are written by the server (service role) only: RLS on, no policies.
--
-- Rollback (only if nothing was sent with it):
--   drop table if exists public.partner_webhook_deliveries;
--   drop table if exists public.distribution_submissions;
-- =============================================================================

create table if not exists public.distribution_submissions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  partner text not null default 'trm',
  artist_id uuid references public.artists(id) on delete set null,
  artist_email text,
  partner_release_id text,
  status text not null default 'preparing',
  history jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  artwork_asset_id text,
  artwork_source_id uuid,
  audio_asset_id text,
  audio_file_name text,
  submit_count integer not null default 0,
  last_event text,
  last_event_at timestamptz,
  upc text,
  isrc text,
  error text,
  terms_accepted_at timestamptz,
  submitted_by uuid,
  submitted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distribution_submissions_release_partner_key unique (release_id, partner)
);

create index if not exists distribution_submissions_partner_release_idx
  on public.distribution_submissions (partner, partner_release_id);
create index if not exists distribution_submissions_artist_idx
  on public.distribution_submissions (artist_id, partner);

alter table public.distribution_submissions enable row level security;

create table if not exists public.partner_webhook_deliveries (
  partner text not null,
  delivery_id text not null,
  event text,
  verified boolean not null default false,
  partner_release_id text,
  release_id uuid,
  outcome text,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb,
  received_at timestamptz not null default now(),
  primary key (partner, delivery_id)
);

create index if not exists partner_webhook_deliveries_received_idx
  on public.partner_webhook_deliveries (partner, received_at desc);

alter table public.partner_webhook_deliveries enable row level security;
