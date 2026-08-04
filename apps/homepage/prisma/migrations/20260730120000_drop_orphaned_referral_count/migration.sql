-- Drops "User"."referralCount", a column present on the live Neon database but
-- absent from schema.prisma and every prior migration file.
--
-- Investigation (2026-07-30): a full git history search (`git log --all -S"referralCount"`,
-- 899 commits, all branches) found zero references to this column in any commit,
-- ever. It traces to URG-39 ("Add a simple referral flow") and its companion
-- URG-41 ("Add share to friend to get credits"), both worked briefly in April/May
-- 2026 and formally canceled 2026-05-24. `referralCode` (the sibling column from
-- the same effort) survived into schema.prisma and migration
-- 20260420110000_extend_user_waitlist; `referralCount` did not — it was created
-- directly against the shared Neon database and never reverted when the feature
-- was shelved.
--
-- A first attempt at a bare `DROP COLUMN` failed with SQLSTATE 2BP01: the view
-- `launch_partner_stats` depends on the column. That view is ALSO undocumented —
-- zero references in the codebase and zero in git history — so the canceled
-- referral work left at least two undeclared objects on production.
--
-- `CASCADE` is deliberately NOT used here. The view computes four metrics and only
-- ONE of them (`qualified_partners`) reads referralCount; CASCADE would delete the
-- whole view and silently take out three unrelated, working metrics. Instead the
-- view is dropped and recreated explicitly without that one column, so the
-- resulting definition is recorded in version control rather than left implicit.
--
-- APPLIED to production Neon on 2026-07-30 (confirmed via production query
-- that every referralCount value was 0, then run out-of-band via the Neon SQL
-- console, transaction-wrapped, no errors — this repo has no automated
-- migration deploy). This file is the historical record of that fix; the
-- statements below are also safe to re-run (DROP COLUMN IF EXISTS, and the
-- view is dropped/recreated identically), so a stale environment that never
-- got the manual fix will simply catch up rather than error.

BEGIN;

DROP VIEW launch_partner_stats;

ALTER TABLE "User" DROP COLUMN IF EXISTS "referralCount";

-- Recreated verbatim from the pre-drop definition, minus `qualified_partners`
-- (which was `count(*) FILTER (WHERE "isLaunchPartner" = true AND "referralCount" >= 1)`).
CREATE VIEW launch_partner_stats AS
SELECT
    count(*) FILTER (WHERE "isLaunchPartner" = true) AS total_launch_partners,
    count(*) AS total_signups,
    round(
        100.0 * count(*) FILTER (WHERE "isLaunchPartner" = true)::numeric
            / NULLIF(count(*), 0)::numeric,
        2
    ) AS launch_partner_percentage
FROM "User";

COMMIT;
