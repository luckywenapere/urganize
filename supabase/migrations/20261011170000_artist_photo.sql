-- Profile photos for artists (2026-10-11, founder ask: "a slot and option for
-- profile photos" on the Artists list and in the directory).
--
-- One nullable column holding a storage path in the private release-assets
-- bucket, under artist/<artist_id>/photo/... The URL is signed on every read and
-- never stored, the curator photo precedent.
--
-- People in the directory already have person_profiles.avatar_storage_path
-- (20260905200000_person_directory.sql); it was never wired to a UI, so no
-- column is needed there.

alter table public.artists
  add column if not exists photo_path text;
