# Needs a decision from Lucky

Things the bug-fixing loop found that need a product call, with a one-line recommendation each.

- **Readable rollout URLs.** Rollouts only have `/dashboard?release=<uuid>` links, so a rollout cannot be bookmarked or shared as a readable address. Recommendation: add a slug route like `/dashboard/rollouts/<slug>` that redirects to the existing URL, keeping the uuid link working.
- **Notification list cap.** `GET /api/notifications` returns at most 20 rows, so one large due-date sweep can push older assignment or comment notifications out of the bell. Recommendation: have the API collapse sweep rows per tier (return one digest row with a count) or raise the cap to 50, and keep the client grouping as is.
- **Realtime toast burst.** The bell shows a toast per inserted notification row, so an app left open during the 07:00 UTC sweep can show a toast for every row. Recommendation: debounce toasts to one per tier per 30 seconds ("5 activities are overdue").
- **Retake the marketing product shots.** The press kit shot on the marketing site still reads "Made with Urganize, the operating system", a line the app dropped on 2026-09-24. Retaking shots (`pnpm --filter @urganize/homepage shots`) needs a signed-in headed Chrome on a seeded demo team, which the sandbox the marketing loop runs in cannot do. Recommendation: run it once from your machine and commit the new images and `content/product-shots.ts`.
