-- Brief board, phase 2 (#897, 2026-10-30): images uploaded to the brief.
--
-- An uploaded image is a reference row of kind 'image' with an empty url and
-- the file's place in the private release-assets bucket (brief/<release_id>/).
-- The server signs it on every read, like the cover art. Its caption is the
-- row's title, as it already is for a linked image.
--
-- Sticky notes need no change here: they are release_brief_cards rows of
-- kind 'note' (card_key 'note:<id>', payload { text }), added in phase 1b.

alter table public.release_brief_references
  add column if not exists storage_path text null
    check (storage_path is null or char_length(storage_path) <= 300);
