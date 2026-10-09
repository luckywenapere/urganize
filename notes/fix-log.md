# Fix log

One line per merged fix: version, what it fixed.

- v1.92.7: notification bell badge and spoken name now agree ("9+" / "more than 9 unread"), and a run of daily sweep rows shows as one expandable line.
- v1.92.8: a burst of alerts (the 07:00 UTC due-date sweep) shows one message instead of one per row; the bell list holds 50 rows instead of 20; the actions route got its 60 second function ceiling, and a guard fails any new model-calling route without one.
- v1.92.9: task lists read every page instead of stopping at 1,000 rows (so a team with many rollouts no longer loses its latest activities from counts, progress and "Released"), comment and file counts are fetched in chunks, and UrgAns reports the same derived rollout status as the catalog.
