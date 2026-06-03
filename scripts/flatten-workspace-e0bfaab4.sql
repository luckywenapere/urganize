-- =============================================================================
-- One-time flatten: workspace e0bfaab4 → exactly one artist named <typed>.
-- Destructive on production. Single transaction, guards inside, rollback on
-- any anomaly. Generated 2026-06-03 against project jsueloedjwpfiyzfoutv.
-- =============================================================================
--
-- Before-state (read at generation time):
--
--   Workspace e0bfaab4-d092-430e-a420-ac2b470edbb8 holds 3 artists:
--     b04f64ec  Lucky Wenapere   (6 releases) ← SURVIVOR (most attached)
--     7256b707  Babyboy Dorian   (1 release: Ifeoma)
--     702c4105  Luckydidthis     (1 release: Test)
--
--   Total: 8 releases. All 8 have a release_metadata sidecar row.
--
-- After-state (asserted by guards at end of DO block):
--
--   Workspace e0bfaab4-d092-430e-a420-ac2b470edbb8 holds 1 artist:
--     b04f64ec  <typed name>     (8 releases — all under it)
--
--   All 8 releases.artist_name           = <typed name>
--   All 8 release_metadata.primary_artist_name = <typed name>
--   Slug derived from <typed name> via the same normalize rule the app uses
--   (lower, [^a-z0-9]+ → '-', strip leading/trailing '-', cap at 80 chars).
--
-- Reversibility: every row touched is captured in
--   backups/20260603T023016Z/{artists,releases,release_metadata}.json
-- Re-INSERT from that snapshot would restore the prior state, though the
-- absorbed artist UUIDs would need to be retained (do NOT reuse the same id
-- if another row was created with it in the meantime).
-- =============================================================================

begin;

do $$
declare
  v_workspace_id uuid := 'e0bfaab4-d092-430e-a420-ac2b470edbb8';
  v_survivor_id  uuid := 'b04f64ec-c5ad-4e97-9df3-c3f400e09bdb';

  -- !!! REPLACE THE PLACEHOLDER BELOW WITH THE TYPED NAME BEFORE RUNNING.
  -- The script will RAISE EXCEPTION if it's left as 'REPLACE_ME'.
  v_new_name     text := 'REPLACE_ME';

  v_new_slug                text;
  reassigned_count          int;
  artist_cache_updated      int;
  metadata_cache_updated    int;
  absorbed_deleted          int;
  remaining_artist_count    int;
  remaining_release_count   int;
  orphan_release_count      int;
begin
  -- Refuse the run if the placeholder hasn't been filled in.
  if v_new_name is null or btrim(v_new_name) = '' or v_new_name = 'REPLACE_ME' then
    raise exception 'flatten: v_new_name is empty or unset. Edit the script and replace the REPLACE_ME placeholder before running.';
  end if;

  v_new_name := btrim(v_new_name);
  if length(v_new_name) > 120 then
    raise exception 'flatten: v_new_name is longer than 120 chars (got %)', length(v_new_name);
  end if;

  -- Slug derivation matches apps/web/lib/release-ops.ts:normalizeReleaseSlug
  v_new_slug := lower(v_new_name);
  v_new_slug := regexp_replace(v_new_slug, '[^a-z0-9]+', '-', 'g');
  v_new_slug := regexp_replace(v_new_slug, '^-+|-+$',    '',  'g');
  v_new_slug := substring(v_new_slug from 1 for 80);
  if v_new_slug = '' then
    -- Same fallback shape as the app, but stable within this transaction.
    v_new_slug := 'artist-' || extract(epoch from now())::bigint;
  end if;

  raise notice 'flatten: workspace=%, survivor=%, new_name=%, new_slug=%',
    v_workspace_id, v_survivor_id, v_new_name, v_new_slug;

  -- Validate survivor exists and is in this workspace.
  perform 1 from public.artists
   where id = v_survivor_id
     and workspace_id = v_workspace_id;
  if not found then
    raise exception 'flatten: survivor % is not in workspace %', v_survivor_id, v_workspace_id;
  end if;

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- Step 1. Reassign every release attached to an absorbed artist in this
  --         workspace → survivor. Only touches rows where artist_id matches an
  --         absorbed (non-survivor) artist in THIS workspace.
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  update public.releases r
     set artist_id  = v_survivor_id,
         updated_at = now()
   where r.artist_id in (
     select id from public.artists
      where workspace_id = v_workspace_id
        and id <> v_survivor_id
   );
  get diagnostics reassigned_count = row_count;
  raise notice 'Step 1: reassigned % release(s) to survivor (expect 2: Ifeoma + Test)', reassigned_count;

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- Step 2. Delete absorbed artist rows. After Step 1 each has 0 releases.
  --         Deleting them before the rename means the partial unique index
  --         (workspace_id, slug) cannot fire when v_new_slug coincidentally
  --         equals 'babyboy-dorian' or 'luckydidthis'.
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  delete from public.artists
   where workspace_id = v_workspace_id
     and id <> v_survivor_id;
  get diagnostics absorbed_deleted = row_count;
  raise notice 'Step 2: deleted % absorbed artist row(s) (expect 2)', absorbed_deleted;

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- Step 3. Rename the survivor. Safe now — partial unique has nothing in
  --         this workspace except the survivor row itself.
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  update public.artists
     set name       = v_new_name,
         slug       = v_new_slug,
         updated_at = now()
   where id = v_survivor_id;
  raise notice 'Step 3: renamed survivor to "%" (slug %)', v_new_name, v_new_slug;

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- Step 4. Write-through artist_name on every release in this workspace.
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  update public.releases
     set artist_name = v_new_name,
         updated_at  = now()
   where artist_id = v_survivor_id;
  get diagnostics artist_cache_updated = row_count;
  raise notice 'Step 4: wrote-through artist_name on % release(s) (expect 8)', artist_cache_updated;

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- Step 5. Write-through primary_artist_name on the metadata sidecar.
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  update public.release_metadata m
     set primary_artist_name = v_new_name,
         updated_at = now()
   where m.release_id in (
     select id from public.releases where artist_id = v_survivor_id
   );
  get diagnostics metadata_cache_updated = row_count;
  raise notice 'Step 5: wrote-through primary_artist_name on % metadata row(s) (expect 8)', metadata_cache_updated;

  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  -- Guards
  -- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  -- G1. The workspace must hold exactly one artist now.
  select count(*) into remaining_artist_count
    from public.artists
   where workspace_id = v_workspace_id;
  if remaining_artist_count <> 1 then
    raise exception 'flatten guard G1: workspace ended with % artists, expected 1', remaining_artist_count;
  end if;

  -- G2. The single remaining artist must be the survivor.
  perform 1 from public.artists
   where workspace_id = v_workspace_id
     and id = v_survivor_id;
  if not found then
    raise exception 'flatten guard G2: survivor row missing after flatten';
  end if;

  -- G3. No release in this workspace may point at a deleted artist.
  --     Joins to artists; any release with artist_id missing from artists is
  --     orphaned (FK is ON DELETE SET NULL, but the partial reassignment in
  --     Step 1 should have caught all of them).
  select count(*) into orphan_release_count
    from public.releases r
   where r.artist_id is not null
     and not exists (
       select 1 from public.artists a where a.id = r.artist_id
     );
  if orphan_release_count > 0 then
    raise exception 'flatten guard G3: % release(s) point at a missing artist', orphan_release_count;
  end if;

  -- G4. The survivor must carry exactly 8 releases (6 native + 2 reassigned).
  --     This is workspace-specific; if you re-purpose this script for a
  --     different workspace, update the expected count or replace this guard
  --     with a "before/after delta" assertion.
  select count(*) into remaining_release_count
    from public.releases
   where artist_id = v_survivor_id;
  if remaining_release_count <> 8 then
    raise exception 'flatten guard G4: survivor carries % releases, expected 8', remaining_release_count;
  end if;

  -- G5. Cache parity: every release.artist_name and every
  --     release_metadata.primary_artist_name for survivor's releases must
  --     equal v_new_name.
  perform 1
    from public.releases r
   where r.artist_id = v_survivor_id
     and (r.artist_name is distinct from v_new_name)
   limit 1;
  if found then
    raise exception 'flatten guard G5a: at least one release.artist_name does not match v_new_name';
  end if;

  perform 1
    from public.release_metadata m
    join public.releases r on r.id = m.release_id
   where r.artist_id = v_survivor_id
     and (m.primary_artist_name is distinct from v_new_name)
   limit 1;
  if found then
    raise exception 'flatten guard G5b: at least one release_metadata.primary_artist_name does not match v_new_name';
  end if;

  raise notice 'flatten complete: workspace has 1 artist ("%"), 8 releases, caches in sync.', v_new_name;
end $$;

-- Post-state visibility (one query, three counts).
select
  (select count(*) from public.artists  where workspace_id = 'e0bfaab4-d092-430e-a420-ac2b470edbb8')                                                                                  as artists_in_workspace,
  (select count(*) from public.releases where artist_id    = 'b04f64ec-c5ad-4e97-9df3-c3f400e09bdb')                                                                                  as releases_under_survivor,
  (select count(distinct artist_name) from public.releases where artist_id = 'b04f64ec-c5ad-4e97-9df3-c3f400e09bdb')                                                                  as distinct_artist_names_in_cache;
-- Expect: 1, 8, 1

commit;
