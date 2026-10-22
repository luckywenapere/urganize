-- Altlink pre-save / smart link (Partner API v2 pilot, Oct 22, 2026).
--
-- ADDITIVE ONLY: two new tables, no change to any existing column.
--
-- release_smart_links: one row per rollout. The unique release_id is the claim
-- that stops a double save making two links: the row is inserted with status
-- 'pending' BEFORE Altlink is called (Altlink also dedupes on
-- external_release_id = our release id). claim_url is stored but not shown.
--
-- altlink_webhook_events: one row per delivery; the event_id primary key is the
-- dedupe, so a replay loses the insert and changes nothing.
--
-- Reads: the rollout's team (owner, or an active member of the owner's
-- workspace). Writes: service role only (no write policy). The webhook table has
-- no client access at all. Grants are explicit because Supabase stops granting
-- public tables to API roles by default on Oct 30, 2026.

create table if not exists public.release_smart_links (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null unique references public.releases(id) on delete cascade,
  altlink_link_id text unique,
  slug text,
  url text,
  claim_url text,
  type text check (type is null or type in ('pre_save', 'smart_link')),
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'live', 'converted', 'failed')),
  release_date date,
  platforms jsonb not null default '[]'::jsonb,
  stats jsonb,
  stats_fetched_at timestamptz,
  presave_signups integer not null default 0,
  last_error text,
  sent_upc text,
  sent_isrc text,
  sent_artwork_asset_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_smart_links_status_idx on public.release_smart_links (status);

drop trigger if exists release_smart_links_set_updated_at on public.release_smart_links;
create trigger release_smart_links_set_updated_at
  before update on public.release_smart_links
  for each row execute function public.set_updated_at();

alter table public.release_smart_links enable row level security;

drop policy if exists "Rollout team reads its smart link" on public.release_smart_links;
create policy "Rollout team reads its smart link"
  on public.release_smart_links for select
  to authenticated
  using (
    exists (
      select 1 from public.releases r
      where r.id = release_smart_links.release_id
        and (
          r.owner_user_id = auth.uid()
          or exists (
            select 1
            from public.workspaces w
            join public.workspace_members m on m.workspace_id = w.id
            where w.owner_id = r.owner_user_id
              and m.user_id = auth.uid()
              and m.status = 'active'
          )
        )
    )
  );

create table if not exists public.altlink_webhook_events (
  event_id text primary key,
  type text,
  received_at timestamptz not null default now()
);

alter table public.altlink_webhook_events enable row level security;

revoke all on public.release_smart_links from anon, authenticated;
grant select on public.release_smart_links to authenticated;
grant all on public.release_smart_links to service_role;

revoke all on public.altlink_webhook_events from anon, authenticated;
grant all on public.altlink_webhook_events to service_role;
