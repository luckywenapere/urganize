# One email to people who stop before adding music (2026-11-28, v1.298.2, #1429, no flag)

Oyin picked the words ("Option A") on 27 Nov. The 10 subject lines that were checked and the three options shown are on issue #1429.

## Why

Measured on production, read-only, 26 and 27 Nov: of 16 real accounts made from 3 to 26 Nov, 15 were seen on one day only, and the ones who stopped before finishing sign-up got no email at all. The onboarding sequence only starts when sign-up is finished.

## What it does

- The morning cron (`app/api/cron/notifications/route.ts`, 09:00 Lagos) calls `runSignupNudgeSweep` (`lib/email/signup-nudge-server.ts`) just before it drains the email outbox.
- The sweep reads accounts made **yesterday** (the Lagos day) with `onboarding_completed = false`, and queues one outbox row each: template `signup_nudge`, `dedupe_key` `signup-nudge:<user id>`. The drain sends it the same run.
- The words, who gets it and the row are pure in `lib/email/signup-nudge.ts` (tested). The template is `templates/SignupNudgeEmail.tsx`: a founder note, signed Oyin, from "Oyin at Urganize" with replies to him, category `onboarding`, so it carries the unsubscribe link and respects it.
- The link is `/onboarding`, which opens "What are you working on?" for an unfinished account.

## Who does not get it

- Anyone who finished sign-up, with music or by skipping. They get the onboarding sequence's day 2 note the same morning, and one email a morning is the rule.
- Playlist owners (`role = curator`).
- Anyone invited to, or already in, a team somebody else owns.
- Anyone from before yesterday. Turning this on emails nobody from the past.

## Traps

- **The words say "yesterday".** That is why the window is exactly yesterday, and why `isSignupNudgeTooLate` makes `planOutboxRun` cancel a row that the daily email limit held back to a later morning. It is never sent late.
- **It does not depend on `EMAIL_ONBOARDING_SEQUENCE`.** That switch pauses only `onboarding_step` rows.
- A missed cron morning means that day's people are not emailed. On purpose: late would be untrue.
- The other founder notes still sign off as "Wena" (`FounderNote.tsx` default, and the day 1 subject). Not changed here: Oyin has not said to.

## Checked

Vitest: `lib/email/signup-nudge.test.ts`. On the local test app the sweep and the drain were run against test accounts (see the PR). No real person was emailed to test it.
