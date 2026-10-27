-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Home asks "What's next for <artist>?" (2026-10-27, next record step 3)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- "Nothing yet, ask me in 2 weeks" snoozes the ask for one artist. The ask
-- comes BEFORE any next_records row exists (answering it is what makes the
-- row), so next_records.snooze_until cannot hold it. The snooze belongs to the
-- artist, for the whole team. One nullable column, nothing backfilled; only
-- the service role writes it (POST .../records/snooze, behind the records gate).
-- See docs/notes/2026-10-27-next-record.md.
--
-- ROLLBACK (manual):
--   alter table public.artists drop column if exists next_record_snooze_until;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.artists add column if not exists next_record_snooze_until timestamptz;
