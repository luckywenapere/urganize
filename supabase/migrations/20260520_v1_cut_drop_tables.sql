-- =============================================================================
-- v1 Cut: Drop out-of-scope tables
-- =============================================================================
--
-- This migration removes all tables, indexes, policies, triggers, functions,
-- and enum types for features cut from the v1 scope. Run AFTER confirming no
-- production data needs to be preserved (except activity_log → activity_logs).
--
-- Cut features:
--   Notes, Folders, Pre-save campaigns, Listener profile, Credits & share links,
--   Tracks & songs (as separate entities), Managed artists, activity_log (singular)
--
-- See CUT_PLAN.md for full context.
-- =============================================================================

begin;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 0. DATA MIGRATION: activity_log (singular) → activity_logs (plural)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The older activity_log table has a simpler schema:
--   id, user_id, release_id, task_id, actor_name, action, message, metadata, created_at
--
-- The newer activity_logs table expects:
--   id, owner_user_id, actor_user_id, release_id, task_id, collaborator_id,
--   asset_id, entity_type, action, message, metadata, created_at
--
-- Mapping:
--   activity_log.user_id     → activity_logs.owner_user_id
--   activity_log.user_id     → activity_logs.actor_user_id  (best guess — same user)
--   activity_log.release_id  → activity_logs.release_id
--   activity_log.task_id     → activity_logs.task_id
--   (no collaborator_id)     → NULL
--   (no asset_id)            → NULL
--   entity_type              → inferred from task_id / release_id presence
--   activity_log.action      → activity_logs.action
--   activity_log.message     → activity_logs.message
--   activity_log.metadata    → activity_logs.metadata  (actor_name added)
--   activity_log.created_at  → activity_logs.created_at

do $$
begin
  -- Only migrate if both tables exist.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_log')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_logs')
  then
    insert into public.activity_logs (
      id,
      owner_user_id,
      actor_user_id,
      release_id,
      task_id,
      collaborator_id,
      asset_id,
      entity_type,
      action,
      message,
      metadata,
      created_at
    )
    select
      al.id,
      al.user_id,
      al.user_id,
      al.release_id,
      al.task_id,
      null,
      null,
      case
        when al.task_id is not null then 'task'::public.activity_entity_type
        when al.release_id is not null then 'release'::public.activity_entity_type
        else 'release'::public.activity_entity_type
      end,
      al.action,
      al.message,
      al.metadata || jsonb_build_object('legacy_actor_name', al.actor_name),
      al.created_at
    from public.activity_log al
    where al.user_id is not null
      and not exists (
        select 1 from public.activity_logs logs where logs.id = al.id
      );

    raise notice 'activity_log data migrated to activity_logs';
  else
    raise notice 'activity_log table does not exist — skipping data migration';
  end if;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. Notes
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Indexes are dropped automatically with the table via CASCADE.
drop table if exists public.release_notes cascade;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. Folders
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- folder_items references folders, so drop child first.
drop table if exists public.folder_items cascade;
drop table if exists public.folders cascade;
drop type if exists public.folder_item_type;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. Pre-save campaigns
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- pre_save_subscribers references pre_save_campaigns, so drop child first.
drop table if exists public.pre_save_subscribers cascade;
drop table if exists public.pre_save_campaigns cascade;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. Listener profile
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop table if exists public.listener_profile_inputs cascade;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5. Credits & share links
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Drop in dependency order (children first).
drop table if exists public.credit_finalizations cascade;
drop table if exists public.contributor_submissions cascade;
drop table if exists public.credit_collection_links cascade;
drop table if exists public.credit_submissions cascade;

-- share_links was used by tracks — drop it here.
drop table if exists public.share_links cascade;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6. Tracks & songs
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- release_songs is a join table linking releases ↔ songs.
drop table if exists public.release_songs cascade;

-- Song library tables: drop leaves first, then root.
drop table if exists public.song_library_notes cascade;
drop table if exists public.song_library_administrative cascade;
drop table if exists public.song_library_production cascade;
drop table if exists public.song_library_publishing cascade;
drop table if exists public.song_library_contributors cascade;
drop table if exists public.song_library_songs cascade;

-- Tracks (audio uploads linked to releases).
drop table if exists public.tracks cascade;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 7. Managed artists
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

drop table if exists public.managed_artists cascade;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 8. activity_log (singular) — replaced by activity_logs (plural)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Data was migrated above (if the table existed). Safe to drop.
-- DROP POLICY requires the table to exist, so guard it.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_log') then
    drop policy if exists "Users can read their activity" on public.activity_log;
  end if;
end $$;
drop index if exists public.activity_log_user_created_idx;
drop index if exists public.activity_log_release_created_idx;
drop table if exists public.activity_log cascade;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 9. Clean up credit-related JSONB columns from release_metadata
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- These columns stored aggregated credit snapshots. The table itself stays
-- (it holds ISRC, UPC, genre, label, etc.) but credit columns are now dead.

alter table public.release_metadata
  drop column if exists producer_credits_json,
  drop column if exists writer_credits_json,
  drop column if exists featured_artist_credits_json,
  drop column if exists mixing_credits_json,
  drop column if exists mastering_credits_json,
  drop column if exists all_credits_json;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 10. Post-migration notes
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- After running this migration:
--
-- a) Update apps/web/app/api/command-center/route.ts to read from
--    'activity_logs' (plural) instead of 'activity_log' (singular).
--    The constant ACTIVITY_LOG_TABLE on line 12 needs to change.
--
-- b) Clean up Supabase Storage buckets manually via the dashboard:
--      - proofs          (folders)
--      - release-audio   (tracks)
--      - release-cover-art (cover art separate flow)
--
-- c) If RLS policies were created at the app level (outside migrations) for
--    any of these tables, they were dropped automatically via CASCADE.

commit;
