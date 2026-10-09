# Fix log

One line per merged fix: version, what it fixed.

- v1.92.7: notification bell badge and spoken name now agree ("9+" / "more than 9 unread"), and a run of daily sweep rows shows as one expandable line.
- v1.92.8: a burst of alerts (the 07:00 UTC due-date sweep) shows one message instead of one per row; the bell list holds 50 rows instead of 20; the actions route got its 60 second function ceiling, and a guard fails any new model-calling route without one.
- v1.92.9: task lists read every page instead of stopping at 1,000 rows (so a team with many rollouts no longer loses its latest activities from counts, progress and "Released"), comment and file counts are fetched in chunks, and UrgAns reports the same derived rollout status as the catalog.
- v1.92.10: the account data export reads every page and every chunk of ids (it stopped at 1,000 rows without saying so and failed the comments section for big teams), account deletion finds every attachment file the same way, and Home reads only the team's own shows inside the query so other teams' shows cannot use up its 100-row cap.
- v1.92.11: push sends (web push and FCM) give up on a silent service after 8 seconds, the morning notification cron bounds its push flush and gives the email outbox what is left of its minute (a stuck push used to starve the onboarding emails), and the three routes that start a Paystack checkout give up after 15 seconds with a plain message and drop the pending payment row.
