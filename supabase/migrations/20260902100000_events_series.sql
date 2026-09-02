-- Events: a festival is a SERIES of single shows.
--
-- Design-partner ask (Chiderah, 2026-09-02): "number of days, like a show with
-- 7 days, 120 minutes each" and "different artists with their own set, for a
-- single festival." Founder call the same day: model it as several linked
-- single shows — one `events` row per artist per day — rather than a festival
-- object with days and a lineup. Every show keeps one artist, one slot, its
-- own setlists and its own DJ pack, so every existing route, access rule and
-- receipt works on each row unchanged, and the events spec's line ("Events
-- cover a single show"; routing, travel, budgets and guest lists stay out)
-- still holds.
--
-- THREE DECISIONS, each cheap to undo by accident:
--
-- 1. A SERIES IS A GROUPING KEY, NOT AN OBJECT. `series_id` has no foreign
--    key because there is nothing to point at: the group is derived from its
--    members. That is also what lets one day be deleted (a cancelled date is a
--    real thing) while the others stand — a parent row with ON DELETE CASCADE
--    would make "cancel Day 3" and "cancel the festival" one operation.
--
-- 2. `series_title` IS DENORMALIZED ONTO EVERY MEMBER so the shows list can
--    group and label without a join (the playlist_pitches precedent). Each
--    member's own `title` stays a complete sentence ("Flytime Fest: Day 3") so
--    a member read on its own — the detail page, a DJ pack header — needs no
--    lookup to make sense.
--
-- 3. ADDITIVE, AND NULL ON EVERY EXISTING ROW. No backfill, no constraint on
--    existing data; a single show is simply a row with no series. The events
--    PATCH deliberately does not accept these columns (lib/events.ts,
--    parseEventFields): which series a show belongs to is a creation fact.
--
-- ROLLBACK (manual):
--   drop index if exists public.events_series_idx;
--   alter table public.events
--     drop column if exists series_day,
--     drop column if exists series_title,
--     drop column if exists series_id;

alter table public.events
  add column if not exists series_id uuid,
  add column if not exists series_title text,
  add column if not exists series_day smallint
    constraint events_series_day_check check (series_day is null or series_day > 0);

-- The grouped list read: members of one series in day order, artists together
-- within a day. Partial, because the common row is a single show.
create index if not exists events_series_idx
  on public.events(series_id, series_day, artist_id)
  where series_id is not null;
