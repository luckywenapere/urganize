-- Catalogue codes and links (2026-10-26, founder approved the "Get link" mock)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Imported catalogue releases (artist_catalogue_releases) gain a UPC and an
-- ISRC, filled in the background from Deezer or typed by hand, and each can
-- get one Altlink smart link on request.
--
-- 1. THE LINK LIVES BESIDE THE CATALOGUE ROW, not in release_smart_links. That
--    table is keyed to a rollout (release_id) and its rules assume a plan;
--    imported releases are past releases with no rollout. One link per
--    catalogue release (unique on catalogue_release_id).
-- 2. THE DAILY CAP IS COUNTED FROM THIS TABLE: rows made today (Lagos) for a
--    workspace. No counter to drift. The limit itself is app_settings key
--    'catalogue_links_per_day' (value_json {"limit": N}); 10 when unset, until
--    Altlink tells us the real limits.
-- 3. codes_checked_at says a release was looked at, so the background lookup
--    never repeats itself; null means "still to look up".
-- 4. PRIVATE TO THE TEAM: select policy for the workspace's members, writes
--    through service-role routes only.
--
-- ROLLBACK (manual):
--   drop table if exists public.catalogue_smart_links;
--   alter table public.artist_catalogue_releases
--     drop column if exists upc, drop column if exists isrc, drop column if exists codes_checked_at;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.artist_catalogue_releases
  add column if not exists upc text,
  add column if not exists isrc text,
  add column if not exists codes_checked_at timestamptz;

create table if not exists public.catalogue_smart_links (
  id uuid primary key default gen_random_uuid(),
  catalogue_release_id uuid not null references public.artist_catalogue_releases(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'pending'
    constraint catalogue_smart_links_status_check check (status in ('pending', 'made', 'failed')),
  altlink_link_id text,
  slug text,
  url text,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalogue_smart_links_release_key
  on public.catalogue_smart_links(catalogue_release_id);

create index if not exists catalogue_smart_links_workspace_day_idx
  on public.catalogue_smart_links(workspace_id, created_at desc);

alter table public.catalogue_smart_links enable row level security;

drop policy if exists "Team members read their catalogue links" on public.catalogue_smart_links;
create policy "Team members read their catalogue links"
  on public.catalogue_smart_links for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = catalogue_smart_links.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = catalogue_smart_links.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop trigger if exists set_catalogue_smart_links_updated_at on public.catalogue_smart_links;
create trigger set_catalogue_smart_links_updated_at
  before update on public.catalogue_smart_links
  for each row execute function public.set_updated_at();

-- Supabase stops auto-granting new public tables on 30 Oct 2026 (CLAUDE.md,
-- principle 9).
grant select, insert, update, delete on public.catalogue_smart_links to authenticated, service_role;
