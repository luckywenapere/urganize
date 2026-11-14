# Extending a trial gives the trial credits back (2026-11-14, #1286, no flag)

The admin's Extend trial (`/admin/teams`, `PATCH /api/admin/teams`, action `extend_trial`) used to move `trial_ends_at` and email the owner, and nothing else. A team whose trial had already ended had lost its trial credits, so the extended trial ran with none.

## What happened (read from production, 14 Nov 2026)

krissyeffect's Team: trial from 27 Oct, 50 trial credits granted; trial ended, nothing bought, and on 31 Oct 03:00 UTC the 50 were taken back (`expire:trial:<team>`); trial extended on 3 Nov to 17 Nov; on 5 Nov their first AI question was answered "You are out of AI credits"; on 6 Nov they bought 50 credits (₦1,500). Two more teams on a running trial sat at 0 the same way (Jazz's Workspace, josephdaniel979's Team).

## The rule now

- `restoreTrialCredits` (`lib/credits/credits-server.ts`) reads the team's newest trial removal (`kind` expire, `pool` trial) and writes one row for exactly that amount: `pool` trial, `kind` adjust, `dedupe_key` `restore:trial:<team>:<removal row id>`, `metadata.source` `trial_extended`. The key names the removal, so each removal is given back at most once. A team that never lost its trial credits gets nothing, and a second extension gives nothing more.
- The route calls it after the new end date has saved, for the extend action only, and writes how many came back into the billing event (`trialCreditsRestored`).
- In the credit history the row reads "Credits added by Urganize: Trial extended: trial credits given back".

## The trap this fixed along the way

The removal was once per team, ever (key `expire:trial:<team>`). After a restore, when the extended trial ended too, the second removal hit the first one's key, the insert counted as "already done", and the credits stayed (and the snapshot reported them gone while they were not). `expireTrialCredits` now numbers its key by how many restores the team has: none keeps the old key, one is `expire:trial:<team>:1`, and so on. If it cannot count the restores it takes nothing, the same fail-toward-keeping rule as the purchase check.

## Not changed

- The grant is still once per team, ever (`trial:<team>`).
- Bought credits, plan allowances and the Free plan removal are untouched; the restore only writes to the trial pool.
- Teams extended before this change were not repaired by it: their rows were written by hand on 14 Nov, in the same shape, with the same key, so the code treats them as already given back.
