-- Metadata collection link refinement (founder spec, 2026-08-27).
--
-- Three changes, deliberately in ONE file: the feature is live in production
-- and the accompanying code reads all three, so applying a subset leaves the
-- app selecting columns that do not exist. Applied by hand in the Supabase
-- dashboard (CLAUDE.md principle 9 — migrations are the source of truth for
-- schema, and this file is that record).
--
-- ⚠️ SECTION 2 DELETES ROWS. Take a snapshot of release_credit_submissions
--    before applying if any real collaborator data is in there.

-- ---------------------------------------------------------------------------
-- 1. Close / reopen a credits link.
-- ---------------------------------------------------------------------------
-- Until now the only way to stop collecting was PUT /credits (rotate the
-- token), which kills the old URL but immediately replaces it with a live one:
-- there was no state where a release had a link that was simply paused. The
-- spec wants a closed link to show a polite "this request is closed" message
-- rather than a 404.
--
-- timestamptz, not a boolean: reopen is `closed_at = null` so no second column
-- is needed, NULL means open so every existing row stays open with no
-- backfill, and the value doubles as display data ("Closed Aug 27").
alter table public.release_credit_links
  add column if not exists closed_at timestamptz;

comment on column public.release_credit_links.closed_at is
  'When the owner closed this link. NULL = open and accepting submissions. Reopening sets it back to NULL; regenerating the token also clears it.';

-- ---------------------------------------------------------------------------
-- 2. Same-email resubmission updates the earlier answer instead of duplicating.
-- ---------------------------------------------------------------------------
-- The original design was submit-once (no UPDATE policy, no edit token), but
-- nothing stopped a DUPLICATE row: the public POST was a bare insert with no
-- lookup, so one person submitting twice made the split totals read 100% when
-- only one contributor was actually credited. The spec makes the second
-- submission an update.
--
-- Uniqueness is per release, case-insensitive, and PARTIAL: `email` is
-- nullable in this table (the form has always required it, but the column does
-- not), and NULL emails must never collide with one another.

-- 2a. Dedupe what already exists, or the unique index below cannot build.
--     Keeps the NEWEST row per (release_id, lower(email)) — a duplicate was a
--     resubmission, and the newest is what that person meant to say. `id` is
--     the deterministic tiebreak when created_at is identical.
delete from public.release_credit_submissions as older
using public.release_credit_submissions as newer
where older.email is not null
  and newer.email is not null
  and older.id <> newer.id
  and older.release_id = newer.release_id
  and lower(older.email) = lower(newer.email)
  and (
    newer.created_at > older.created_at
    or (newer.created_at = older.created_at and newer.id > older.id)
  );

-- 2b. The constraint that makes a concurrent double-submit lose loudly (23505,
--     which the route retries as an update) instead of silently duplicating.
create unique index if not exists release_credit_submissions_release_email_key
  on public.release_credit_submissions (release_id, lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- 3. ISWC on the release.
-- ---------------------------------------------------------------------------
-- ISRC (the recording) and UPC (the release) were already here; ISWC (the
-- composition, issued by the collection society) was not, and it belongs to
-- the release rather than to any one contributor — so it lives here and is
-- edited by the owner, never asked of a collaborator.
alter table public.release_metadata
  add column if not exists iswc text;

comment on column public.release_metadata.iswc is
  'ISWC for the composition (T-123456789-1). Release-level, owner-entered; never collected on the public credits form.';

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
-- ---------------------------------------------------------------------------
--   drop index if exists public.release_credit_submissions_release_email_key;
--   alter table public.release_credit_links drop column if exists closed_at;
--   alter table public.release_metadata drop column if exists iswc;
-- The rows deleted by section 2a are NOT recoverable from here.
