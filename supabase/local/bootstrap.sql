-- LOCAL ONLY (issue #862). Never run this against production.
--
-- Runs before the first migration on a fresh local database
-- (scripts/local-db.mjs). It stands in for the objects production already had
-- before supabase/migrations began: the early migrations ALTER them instead of
-- creating them. Each block names the migration that needs it. Keep every
-- object here minimal: the migrations add the real columns (they use
-- "add column if not exists"), and 20260525034856_schema_reconciliation drops
-- the legacy ones, so the end result matches what the migrations describe.

create extension if not exists pgcrypto;

-- 20260430_execution_upgrade alters releases and tasks and indexes
-- tasks(release_id, state, status) before 20260510 creates either table.
do $$ begin
  create type public.task_status as enum ('locked', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references public.releases(id) on delete cascade,
  status public.task_status not null default 'todo'
);

-- 20260520_v1_cut_drop_tables drops credit columns from release_metadata, a
-- table production made through schema-missing fallback code. The shape below
-- is the one 20260525034856_schema_reconciliation writes down for it (its
-- "create table if not exists" then does nothing).
create table if not exists public.release_metadata (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  isrc text,
  upc text,
  primary_artist_name text not null default '',
  release_title text not null default '',
  genre text,
  subgenre text,
  label_name text,
  language text,
  explicit boolean,
  artwork_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- releases.artist_id: production had this column before any migration (the
-- 2026-05-24 schema dump shows it, pointing at an artists table the v1 cut
-- later dropped and 20260525034856 re-created). No migration adds it, but
-- 20260602010000_releases_link_artists_swap_unique reads it. The foreign key
-- arrives with 20260830100000_releases_artist_id_restrict.
alter table public.releases add column if not exists artist_id uuid;

-- releases.slug: also in production before any migration (the 2026-05-24
-- schema dump), never added by a migration, and selected by POST /api/releases
-- (lib/release-ops.ts). Without it every new rollout fails with
-- "Release operations tables are missing." (a 501).
alter table public.releases add column if not exists slug text;
