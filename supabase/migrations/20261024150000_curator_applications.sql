-- Curator applications (2026-10-24, founder approved mocks v2-apply / v2-sent /
-- v2-admin).
--
-- A playlist owner without an invite applies at /curator/apply. An admin reads
-- the application at /admin/curator-applications and either approves it, which
-- mints the existing single-use curator invite (curator_invites) and links it
-- here, or declines it.
--
-- Access:
--   * RLS is on. anon may INSERT a fresh application only (status 'new', no
--     invite, not reviewed). Nobody but the service role can read or update:
--     there are no select/update/delete policies, the same posture as
--     curator_invites, because admin routes read through the service role
--     after verifyAdmin (ADMIN_EMAILS). The app itself inserts through
--     POST /api/curator/apply (service role, after the spam checks), so the
--     anon policy is the ceiling, not the path.
--   * Explicit grants (Supabase stops auto-granting new public tables on
--     30 Oct 2026; see 20261024120000_explicit_table_grants.sql and CLAUDE.md
--     principle 9). The default privileges restored by that migration would
--     hand anon and authenticated every privilege, so this revokes first and
--     grants exactly what is meant.
--
-- ip_hash is a salted SHA-256 of the sender's IP, kept only for the per-network
-- rate limit. It is never shown.
--
-- Safe to run more than once.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.curator_applications;

create table if not exists public.curator_applications (
  id uuid primary key default gen_random_uuid(),
  playlist_url text not null check (char_length(playlist_url) between 1 and 500),
  playlist_name text check (playlist_name is null or char_length(playlist_name) <= 120),
  platform text check (platform is null or platform in ('spotify', 'apple_music', 'audiomack', 'boomplay')),
  followers integer not null check (followers >= 0),
  genre text not null check (genre in ('afrobeats', 'amapiano', 'alte', 'hip_hop', 'other')),
  country text not null check (char_length(country) between 1 and 60),
  contact text not null check (char_length(contact) between 1 and 120),
  contact_kind text not null default 'email' check (contact_kind in ('email', 'whatsapp')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'approved', 'declined')),
  invite_id uuid references public.curator_invites(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  ip_hash text,
  created_at timestamptz not null default now()
);

-- The admin list: one status, newest first.
create index if not exists curator_applications_status_created_idx
  on public.curator_applications(status, created_at desc);

-- The rate limits: recent rows per network and per contact.
create index if not exists curator_applications_ip_created_idx
  on public.curator_applications(ip_hash, created_at desc);
create index if not exists curator_applications_contact_created_idx
  on public.curator_applications(contact, created_at desc);

alter table public.curator_applications enable row level security;

drop policy if exists "Anyone can send a new curator application" on public.curator_applications;
create policy "Anyone can send a new curator application"
  on public.curator_applications
  for insert
  to anon
  with check (
    status = 'new'
    and invite_id is null
    and reviewed_by is null
    and reviewed_at is null
  );

-- No select, update or delete policies on purpose: only the service role
-- (admin routes behind verifyAdmin) reads or changes applications.

revoke all on public.curator_applications from anon, authenticated;
grant insert on public.curator_applications to anon;
grant select, insert, update, delete on public.curator_applications to service_role;
