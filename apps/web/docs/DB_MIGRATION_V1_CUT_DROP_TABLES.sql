-- v1 cut: drop out-of-scope tables
-- Run AFTER confirming no production data needs to be preserved
-- See CUT_PLAN.md §15 for full context

-- Notes
drop table if exists public.release_notes cascade;

-- Folders
drop table if exists public.folder_items cascade;
drop table if exists public.folders cascade;
drop type if exists public.folder_item_type;

-- Pre-save
drop table if exists public.pre_save_subscribers cascade;
drop table if exists public.pre_save_campaigns cascade;

-- Listener profile
drop table if exists public.listener_profile_inputs cascade;

-- Credits
drop table if exists public.credit_finalizations cascade;
drop table if exists public.contributor_submissions cascade;
drop table if exists public.credit_collection_links cascade;
drop table if exists public.credit_submissions cascade;

-- Tracks & songs
drop table if exists public.release_songs cascade;
drop table if exists public.song_library_notes cascade;
drop table if exists public.song_library_administrative cascade;
drop table if exists public.song_library_production cascade;
drop table if exists public.song_library_publishing cascade;
drop table if exists public.song_library_contributors cascade;
drop table if exists public.song_library_songs cascade;
drop table if exists public.share_links cascade;
drop table if exists public.tracks cascade;

-- Managed artists
drop table if exists public.managed_artists cascade;

-- Duplicate activity log (per CLAUDE.md known issue #3)
drop table if exists public.activity_log cascade;

-- Storage buckets to clean up manually via Supabase dashboard:
--   proofs          (folders)
--   release-audio   (tracks)
--   release-cover-art (cover art separate flow)
