-- Join duplicate artists (2026-10-29, #865, founder approved the mock "artist-fuse")
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Importing releases joined an existing artist only on an exact name, so
-- "Babyboy Dorian" (pulled from Deezer) sat beside "Dorian" (made by the team)
-- as two artists. The Artists page now offers to join look-alike pairs, and the
-- import asks first. Three pieces:
--
-- 1. artists.created_via: 'manual' or 'import'. The profile the team made is
--    the one that stays when two are joined. Backfill: an artist whose first
--    catalogue row landed within two minutes of the artist itself was made by
--    the import (the import writes both in one request).
-- 2. artist_merge_dismissals: pairs a team said are different people, so the
--    popup never asks about them again. Ordered pair (artist_a < artist_b).
-- 3. merge_artists(keep, drop): moves everything from drop onto keep in one
--    transaction, then deletes drop. Service role only.
--
-- ROLLBACK (manual):
--   drop function if exists public.merge_artists(uuid, uuid);
--   drop table if exists public.artist_merge_dismissals;
--   alter table public.artists drop column if exists created_via;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.artists
  add column if not exists created_via text not null default 'manual';

alter table public.artists drop constraint if exists artists_created_via_check;
alter table public.artists
  add constraint artists_created_via_check check (created_via in ('manual', 'import'));

update public.artists a
set created_via = 'import'
where a.created_via = 'manual'
  and exists (
    select 1 from public.artist_catalogue_releases c
    where c.artist_id = a.id
      and c.created_at <= a.created_at + interval '2 minutes'
  );

create table if not exists public.artist_merge_dismissals (
  artist_a uuid not null references public.artists(id) on delete cascade,
  artist_b uuid not null references public.artists(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dismissed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (artist_a, artist_b),
  constraint artist_merge_dismissals_order_check check (artist_a < artist_b)
);

create index if not exists artist_merge_dismissals_workspace_idx
  on public.artist_merge_dismissals(workspace_id);

alter table public.artist_merge_dismissals enable row level security;

drop policy if exists "Team members read their dismissals" on public.artist_merge_dismissals;
create policy "Team members read their dismissals"
  on public.artist_merge_dismissals for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = artist_merge_dismissals.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = artist_merge_dismissals.workspace_id
        and w.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.artist_merge_dismissals to authenticated, service_role;

-- Moves every row that points at p_drop onto p_keep, then deletes p_drop.
-- Both must be on the same team. Where a table allows one row per artist
-- (press kit, one fact per topic, one catalogue row per source release), the
-- row p_keep already has wins and p_drop's copy goes with p_drop.
create or replace function public.merge_artists(p_keep uuid, p_drop uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.artists%rowtype;
  d public.artists%rowtype;
  moved_releases int := 0;
  moved_catalogue int := 0;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'merge_artists: two different artists are needed';
  end if;

  select * into k from public.artists where id = p_keep for update;
  select * into d from public.artists where id = p_drop for update;
  if k.id is null or d.id is null then
    raise exception 'merge_artists: artist not found';
  end if;
  if k.workspace_id is null or k.workspace_id is distinct from d.workspace_id then
    raise exception 'merge_artists: artists are on different teams';
  end if;

  -- Rollouts, with the two name caches renameWorkspaceArtist keeps in step.
  update public.release_metadata set primary_artist_name = k.name, updated_at = now()
  where release_id in (select id from public.releases where artist_id = p_drop);
  update public.releases set artist_id = p_keep, artist_name = k.name, updated_at = now()
  where artist_id = p_drop;
  get diagnostics moved_releases = row_count;

  -- Past releases: drop's copy of a release keep already has goes.
  delete from public.artist_catalogue_releases c
  where c.artist_id = p_drop
    and exists (
      select 1 from public.artist_catalogue_releases o
      where o.artist_id = p_keep and o.source = c.source and o.source_id = c.source_id
    );
  update public.artist_catalogue_releases set artist_id = p_keep where artist_id = p_drop;
  get diagnostics moved_catalogue = row_count;

  -- One fact per topic (except 'other').
  delete from public.artist_facts f
  where f.artist_id = p_drop and f.topic <> 'other'
    and exists (select 1 from public.artist_facts o where o.artist_id = p_keep and o.topic = f.topic);
  update public.artist_facts set artist_id = p_keep where artist_id = p_drop;

  -- One press kit per artist: drop's moves only when keep has none.
  if not exists (select 1 from public.press_kits where artist_id = p_keep) then
    update public.press_kits set artist_id = p_keep where artist_id = p_drop;
  end if;

  update public.artist_posts set artist_id = p_keep where artist_id = p_drop;
  update public.next_records set artist_id = p_keep where artist_id = p_drop;
  update public.songs set artist_id = p_keep where artist_id = p_drop;
  update public.events set artist_id = p_keep where artist_id = p_drop;
  update public.opportunities set artist_id = p_keep where artist_id = p_drop;
  update public.grant_suggestions set artist_id = p_keep where artist_id = p_drop;
  update public.distribution_submissions set artist_id = p_keep where artist_id = p_drop;

  -- Teammates limited to drop now see keep. Without this, delete would set
  -- their scope to null, which means they see everything.
  update public.workspace_members set artist_scope_id = p_keep where artist_scope_id = p_drop;
  update public.workspace_invite_links set artist_scope_id = p_keep where artist_scope_id = p_drop;

  -- Keep's own look wins; drop's fills only what keep lacks.
  update public.artists set
    photo_path = coalesce(k.photo_path, d.photo_path),
    brand_background = coalesce(k.brand_background, d.brand_background),
    brand_accent = coalesce(k.brand_accent, d.brand_accent),
    updated_at = now()
  where id = p_keep;

  delete from public.artists where id = p_drop;

  return jsonb_build_object('releases', moved_releases, 'catalogue', moved_catalogue);
end;
$$;

revoke all on function public.merge_artists(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_artists(uuid, uuid) to service_role;
