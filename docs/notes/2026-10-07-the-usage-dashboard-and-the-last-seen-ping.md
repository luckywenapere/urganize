# The usage dashboard and the "last seen" ping (2026-10-07)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask: a live dashboard of who is using Urganize, how many rollouts have been made, and the numbers an advisor call flagged as missing (no monthly active users, people drop off between releases, AI cost, the AI-plan vs own-plan split). `/admin/metrics`, internal, no flag, no changelog entry. Plan: `C:\Users\penta\.claude\plans\create-a-dashboard-for-gleaming-mitten.md`.

**Decisions (founder):** "live users" means online now plus daily / weekly / monthly active, which needed a small last-seen ping; a new page, the Scoreboard left as it is; refresh every 60 seconds while the tab is visible.

**The ping.** `components/app/PresenceBeacon.tsx` (mounted once in AppShell) posts to `POST /api/presence` every 2 minutes while a signed-in tab is visible, and on coming back to it. The route upserts one row per person per Lagos day into `user_presence_days` (migration `20261007120000_user_presence_days.sql`, **not applied yet**): first and last time seen, and the kind of device (`desktop_web`, `phone_web`, `installed`, `android_app`, `ios_app`). Rules in `lib/presence.ts`: online means seen in the last 5 minutes, more than two ping intervals so one missed ping does not flicker someone off. Four things not to undo:
1. **The route is open (`getAuthenticatedUser`), never the paywall wrapper.** A walled or read-only team still opens the app, and those are the people the retention numbers most need. It never answers 402. A guard test enforces both.
2. **It never fails the caller**: a missing table or a write error is logged and still answers 204.
3. **`presenceDay` has its own copy of the Lagos offset** so the browser bundle does not import the email module; a test checks it agrees with `lagosDayStart` across a whole day.
4. The rows are part of the account data export (`days_you_used_urganize`) and go with the account by cascade.

**The numbers.** `lib/usage-metrics.ts` (pure, every rule), `lib/usage-metrics-server.ts` (reads), `GET /api/admin/metrics` (`verifyAdmin` first, `?team=1` to include our team), `components/admin/MetricsView.tsx` (display only). Sections: Right now, Active people (with a 30-day chart and the device split), Rollouts (weekly chart and how plans were made), Accounts, Work done, Between releases, Gone quiet, Recently active.
- **"Active" here is wider than on the Scoreboard, on purpose.** A person is active on a day if the ping saw them, they did something (the same 18 activity tables), they opened the app (the login-ping's `scheduled_notifications` `momentum_30m` rows, back to 2026-07-23), or they signed in. The Scoreboard keeps the strategy doc's "did something" rule.
- **The shared reads moved to `lib/admin-read-server.ts`** (`readAll`, `ACTIVITY_SOURCES` now with a plain `label` each, `readActivity` now also returns each person's latest labelled event). `loadScoreboardInput` also returns `extras` (latest events, raw release and task rows; the task select gained `auto_generated, created_at`) so this page reads nothing twice. The Scoreboard's own output did not change.
- **How plans were made** (`classifyPlan`): the plan draft's `doc.ai.applied` wins; `planned_by_urgans` alone is not enough, because the build stamps it whether or not the model changed anything.
- **Between releases**: active in 30 days, curators left out, and no team rollout open (a date today or later, or no date and work left). **Gone quiet**: last seen 31 to 90 days ago.
- **Our team is hidden by default**: `ADMIN_EMAILS` plus the new optional `METRICS_INTERNAL_EMAILS`. The page names who is left out and has a "Show our team" button.
- AI cost reads `ai_usage_events` when it exists, else the credit ledger's spend rows, and says "Not tracked" when neither can be read. Both tables have one-writer guards; this file is named in each as a reader, with a test that it never writes.
- Every read reports a missing table in "Not fully read" and blanks only the number it feeds.

**Verified:** 6,709 tests passing (51 new: 49 across `presence`, `usage-metrics`, `usage-metrics-format`, `usage-metrics-server` and `usage-metrics-guard`, and one reader assertion in each of the two one-writer guards); eight deliberate breaks each caught by a named test (one survived at first, a real gap, now covered: an untailored plan carries the `planned_by_urgans` stamp too). `tsc` only the 8 known errors. Lint: one new warning, the page's fetch-on-load effect, the same accepted pattern as the Scoreboard page. **Pre-existing failure, not from this change:** `lib/home-layout-guard.test.ts` (Home skeleton) fails on untouched `main`.

`next build` green with `/admin/metrics`, `/auth`, `/dashboard`, `/onboarding` and `/settings` static. The page was looked at with made-up numbers through a throwaway page (deleted): no sideways scroll at 375 or 1440, the table scrolls inside its own box on a phone, and both themes resolve through the tokens.

**Not verified:** nothing has run against the real database (the migration is unapplied) or with a real admin session, and no ping has been recorded.

**Activation:** apply the migration; set `METRICS_INTERNAL_EMAILS` on the Vercel `Web` project (Production) with the founder's other accounts and teammates; open `/admin/metrics` and confirm you appear under "Online now" within two minutes (with "Show our team" on), and that the rollout total matches `select count(*) from releases where coalesce(metadata->>'test_release','') <> 'true';`.

**Not built:** website-to-signup conversion (needs a PostHog read key, which the app refuses on purpose), and restoring the "plan it myself" option in the rollout flow (separate task).
