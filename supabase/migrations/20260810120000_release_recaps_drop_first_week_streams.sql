-- The recap card's "first week streams" input was cut (founder call,
-- 2026-08-10): with no DSP integration the number was hand-typed anyway, and
-- it wasn't worth the friction. The highlight input stays.
--
-- ROLLBACK (manual, if ever needed): re-add the column and its check
-- constraint from 20260810090000_release_recaps.sql:
--   alter table public.release_recaps add column first_week_streams bigint;
--   alter table public.release_recaps
--     add constraint release_recaps_first_week_streams_non_negative
--     check (first_week_streams is null or first_week_streams >= 0);

alter table public.release_recaps
  drop constraint if exists release_recaps_first_week_streams_non_negative;

alter table public.release_recaps
  drop column if exists first_week_streams;
