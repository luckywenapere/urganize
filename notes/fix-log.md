# Fix log

One line per merged fix: version, what it fixed.

- v1.92.7: notification bell badge and spoken name now agree ("9+" / "more than 9 unread"), and a run of daily sweep rows shows as one expandable line.
- v1.92.8: a burst of alerts (the 07:00 UTC due-date sweep) shows one message instead of one per row; the bell list holds 50 rows instead of 20; the actions route got its 60 second function ceiling, and a guard fails any new model-calling route without one.
- v1.92.9: task lists read every page instead of stopping at 1,000 rows (so a team with many rollouts no longer loses its latest activities from counts, progress and "Released"), comment and file counts are fetched in chunks, and UrgAns reports the same derived rollout status as the catalog.
- v1.92.10: the account data export reads every page and every chunk of ids (it stopped at 1,000 rows without saying so and failed the comments section for big teams), account deletion finds every attachment file the same way, and Home reads only the team's own shows inside the query so other teams' shows cannot use up its 100-row cap.
- v1.92.11: push sends (web push and FCM) give up on a silent service after 8 seconds, the morning notification cron bounds its push flush and gives the email outbox what is left of its minute (a stuck push used to starve the onboarding emails), and the three routes that start a Paystack checkout give up after 15 seconds with a plain message and drop the pending payment row.
- v1.92.12: follow-up work that used to be fired and forgotten after the reply (assignment and status notifications, the who-changed-this row, founder payment alerts, billing events, token last-used) now goes through Next's after(), so the host keeps it alive until it finishes; a source guard fails any new bare void on those helpers.
- v1.92.13: Home reads a release date held as a plain calendar day ("2026-11-24") as that local day, so the days-to-go count and the plan's week no longer come out a day early west of UTC; the Paystack webhook's signature check moved to `lib/paystack-signature.ts` and compares decoded byte lengths, so a forged non-hex signature gets a 401 instead of throwing a 500.
- v1.162.2: F-02: ProfileFace falls back to a flat initials tile when its photo fails to load (and drops the gradient tile); pure rule in lib/profile-face.ts.
- v1.162.3: F-03: SwipePager sets document.title on each tab change (swipeDocumentTitle in lib/swipe-nav.ts); Directory metadata no longer repeats the brand.
