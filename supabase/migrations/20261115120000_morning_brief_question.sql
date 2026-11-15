-- One question a day at the end of the morning brief (#1314, 15 Nov 2026).
--
-- What each person told the brief: their answers, the last question asked and
-- what came of it, skips, and the switch for the questions. Read and written
-- by the server only (lib/chappi/brief-answers-server.ts and the 8am job), and
-- always read back through sanitizeBriefPrefs, so a bad value is dropped.
-- Additive only: the column defaults to an empty object and nothing else moves.

alter table public.profiles
  add column if not exists brief_prefs jsonb not null default '{}'::jsonb;
