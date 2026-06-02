-- =============================================================================
-- releases: resolve null artist_id, tighten to NOT NULL, swap artists unique
-- =============================================================================
--
-- Phase 2 of the workspace-scoped artists initiative. Migration 1 added
-- artists.workspace_id (nullable, backfilled). This migration:
--
--   1. Resolves any release with artist_id IS NULL but artist_name set into a
--      real artists row (workspace-scoped). Per Phase 0 inventory (2026-06-02)
--      there are zero such releases in production today, but a resolver is
--      provided so this migration is safe to re-apply if drift appears later.
--   2. Verifies every release has a non-null artist_id and raises an exception
--      if any release is unlinked. Tightening to NOT NULL is gated on the
--      verification passing.
--   3. Sets releases.artist_id NOT NULL.
--   4. Swaps the artists unique index from (owner_user_id, slug) to
--      (workspace_id, slug). Keeps the owner_user_id column on the table for
--      now — RLS policies still read it and removing it is a separate cleanup
--      phase.
--
-- IMPORTANT: This migration MUST run after 20260602_artists_add_workspace_id
-- (which adds artists.workspace_id and its FK). Filename timestamp ordering
-- guarantees that.
--
-- Down-migration is provided as a commented block at the end. One-way step:
-- the unique-index swap is reversible, but any artist row inserted by the
-- resolver (step 1) cannot be safely un-created — those rows are documented
-- in the apply log via RAISE NOTICE. In production today the resolver inserts
-- nothing, so the down-migration is a clean inverse.
-- =============================================================================

begin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. Resolve any null-artist_id releases via workspace-scoped lookup-or-create.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- For each release where artist_id IS NULL AND artist_name IS NOT NULL:
--   a. Find the release owner's workspace (workspaces.owner_id = release.owner_user_id).
--   b. Look up an existing artist by (workspace_id, lower(slug)) where slug is
--      derived from the release.artist_name with the same normalization the
--      app uses (lowercase, alphanumeric+hyphen). If found, link.
--   c. Else insert a new artist row scoped to the workspace, link.
-- Reports each resolved release via RAISE NOTICE so it's visible in the apply log.

do $$
declare
  rel record;
  resolved_workspace_id uuid;
  resolved_artist_id uuid;
  derived_slug text;
  inserted_artist_count int := 0;
  linked_existing_count int := 0;
  skipped_no_workspace_count int := 0;
  skipped_no_artist_name_count int := 0;
begin
  for rel in
    select id, owner_user_id, artist_name
      from public.releases
     where artist_id is null
  loop
    if rel.artist_name is null or length(btrim(rel.artist_name)) = 0 then
      skipped_no_artist_name_count := skipped_no_artist_name_count + 1;
      raise notice
        'Release % skipped: artist_id null and artist_name empty (cannot resolve).',
        rel.id;
      continue;
    end if;

    select id into resolved_workspace_id
      from public.workspaces
     where owner_id = rel.owner_user_id;

    if resolved_workspace_id is null then
      skipped_no_workspace_count := skipped_no_workspace_count + 1;
      raise notice
        'Release % skipped: owner % has no workspace (cannot scope a new artist).',
        rel.id, rel.owner_user_id;
      continue;
    end if;

    -- Derive slug with the same rule the app uses (apps/web/lib/release-ops.ts
    -- normalizeReleaseSlug): lowercase, replace non-alphanumeric with '-',
    -- trim leading/trailing '-', collapse repeats.
    derived_slug := lower(btrim(regexp_replace(rel.artist_name, '[^a-zA-Z0-9]+', '-', 'g'), '-'));
    if derived_slug = '' then
      derived_slug := 'artist-' || extract(epoch from now())::bigint::text;
    end if;

    select id into resolved_artist_id
      from public.artists
     where workspace_id = resolved_workspace_id
       and slug = derived_slug
     limit 1;

    if resolved_artist_id is null then
      -- Fall back to owner-scoped lookup before insert. The old unique index
      -- is still (owner_user_id, slug) at this point in the migration; an
      -- insert with a colliding owner-slug pair would fail. The fallback
      -- catches the case where the artist row exists but its workspace_id is
      -- NULL (the one Phase-0 orphan owned by 0a6cad1c).
      select id into resolved_artist_id
        from public.artists
       where owner_user_id = rel.owner_user_id
         and slug = derived_slug
       limit 1;
    end if;

    if resolved_artist_id is null then
      insert into public.artists (owner_user_id, workspace_id, name, slug, updated_at)
      values (rel.owner_user_id, resolved_workspace_id, btrim(rel.artist_name), derived_slug, now())
      returning id into resolved_artist_id;
      inserted_artist_count := inserted_artist_count + 1;
      raise notice
        'Release % resolved by inserting new artist % (workspace %, name %).',
        rel.id, resolved_artist_id, resolved_workspace_id, btrim(rel.artist_name);
    else
      linked_existing_count := linked_existing_count + 1;
      raise notice
        'Release % linked to existing artist % (workspace %).',
        rel.id, resolved_artist_id, resolved_workspace_id;
    end if;

    update public.releases
       set artist_id = resolved_artist_id
     where id = rel.id;
  end loop;

  raise notice
    'Release artist_id resolver complete: linked_existing=%, inserted_new=%, skipped_no_workspace=%, skipped_no_artist_name=%.',
    linked_existing_count, inserted_artist_count, skipped_no_workspace_count, skipped_no_artist_name_count;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. Verify every release has a non-null artist_id before tightening.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

do $$
declare
  total_releases int;
  unlinked_releases int;
begin
  select count(*) into total_releases from public.releases;
  select count(*) into unlinked_releases from public.releases where artist_id is null;

  raise notice
    'Pre-NOT-NULL check: total releases=%, unlinked (artist_id null)=%',
    total_releases, unlinked_releases;

  if unlinked_releases > 0 then
    raise exception
      'Cannot tighten releases.artist_id to NOT NULL: % release row(s) still have artist_id IS NULL. Investigate before re-applying.',
      unlinked_releases;
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. Tighten: releases.artist_id NOT NULL.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.releases
  alter column artist_id set not null;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. Swap the artists unique index from (owner_user_id, slug) to
--    (workspace_id, slug). Keep owner_user_id column intact.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Pre-check: confirm no (workspace_id, slug) collisions exist. Phase 0 shows
-- the old (owner_user_id, slug) index is unique and each owner maps to at
-- most one workspace, so (workspace_id, slug) is also unique by construction.
-- This guard catches any drift introduced since recon.

do $$
declare
  collision_count int;
begin
  select count(*) into collision_count
    from (
      select workspace_id, slug, count(*) as c
        from public.artists
       where workspace_id is not null
       group by workspace_id, slug
      having count(*) > 1
    ) collisions;

  if collision_count > 0 then
    raise exception
      'Cannot create artists_workspace_slug_idx: % (workspace_id, slug) pair(s) collide. Resolve duplicates before re-applying.',
      collision_count;
  end if;
end $$;

create unique index if not exists artists_workspace_slug_idx
  on public.artists(workspace_id, slug)
  where workspace_id is not null;

drop index if exists public.artists_owner_slug_idx;

commit;

-- =============================================================================
-- DOWN MIGRATION (apply manually if rolling back this change)
-- =============================================================================
--
-- One-way caveat: any artist row inserted by step 1 of this migration cannot
-- be safely un-created — it may now be referenced by releases.artist_id and
-- by other downstream rows. In production at apply time (2026-06-02 Phase 0)
-- step 1 was a no-op, so the down-migration below cleanly reverses the
-- schema-only changes.
--
-- begin;
--
-- create unique index if not exists artists_owner_slug_idx
--   on public.artists(owner_user_id, slug);
--
-- drop index if exists public.artists_workspace_slug_idx;
--
-- alter table public.releases
--   alter column artist_id drop not null;
--
-- commit;
