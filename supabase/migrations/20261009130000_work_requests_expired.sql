-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- WORK REQUESTS CLOSE AFTER 7 DAYS (2026-10-09)
--
-- The directory spec's request flow: the recipient accepts, declines, or does
-- not reply in 7 days and it closes. Until now a request nobody answered sat
-- as `new` forever, which held one of the sender team's ten open slots and the
-- one-open-request-per-person-per-role guard for good.
--
-- This only widens the status CHECK. A request is never moved by the database
-- itself: the daily sweep (runWorkRequestExpirySweep, a passenger on
-- /api/cron/due-date-notifications) sets `expired` where a request is still
-- `new` and older than 7 days.
--
-- The app does NOT wait for this migration. Every read treats a stale waiting
-- request as closed through effectiveRequestStatus, and the routes refuse an
-- answer to one, so the product is right before this is applied and between
-- sweeps. What needs the migration is only the sweep being able to write the
-- value, which frees the open slot.
--
-- Additive and safe to re-run. The partial unique index that allows one open
-- request per team per person per role is `where status = 'new'`, so an expired
-- request drops out of it and the sender can ask the same person for the same
-- role again. This file does not touch that index.
--
-- ROLLBACK (manual): set any `expired` rows to `passed`, then drop the status
-- constraint below and re-add it with only 'new', 'interested' and 'passed'.
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.work_requests drop constraint if exists work_requests_status_check;
alter table public.work_requests
  add constraint work_requests_status_check
  check (status in ('new', 'interested', 'passed', 'expired'));

-- The sweep's own read: waiting requests, oldest first. Partial, so it stays
-- tiny however many answered requests pile up.
create index if not exists work_requests_waiting_idx
  on public.work_requests(created_at)
  where status = 'new';
