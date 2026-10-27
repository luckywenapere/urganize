-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The next record's cover (2026-10-27, v2 mocks approved by Oyin)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- The record page opens on a big cover tile. Until there is art it is a flat
-- colour from the artist; the team can pick another colour or add a picture.
-- See docs/notes/2026-10-27-next-record.md, "v2 decisions".
--
-- cover_path: a picture in the private release-assets bucket, under
--   record/<record id>/cover/, read through short-lived signed URLs (the
--   artist photo pattern). Null means no picture.
-- cover_color: a colour the team picked, as #rrggbb. Null means the artist's
--   own colour, worked out in code (lib/next-records.ts), so nothing is
--   required.
--
-- Additive only: two nullable columns, no rows change.
--
-- ROLLBACK (manual):
--   alter table public.next_records drop column if exists cover_path, drop column if exists cover_color;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.next_records
  add column if not exists cover_path text
    constraint next_records_cover_path_check check (cover_path is null or char_length(cover_path) <= 512),
  add column if not exists cover_color text
    constraint next_records_cover_color_check check (cover_color is null or cover_color ~ '^#[0-9a-f]{6}$');
