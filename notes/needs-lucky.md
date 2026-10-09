# Needs a decision from Lucky

Things the bug-fixing loop found that need a product call, with a one-line recommendation each.

- **Readable rollout URLs.** Rollouts only have `/dashboard?release=<uuid>` links, so a rollout cannot be bookmarked or shared as a readable address. Recommendation: add a slug route like `/dashboard/rollouts/<slug>` that redirects to the existing URL, keeping the uuid link working.
- **Retake the marketing product shots.** The press kit shot on the marketing site still reads "Made with Urganize, the operating system", a line the app dropped on 2026-09-24. Retaking shots (`pnpm --filter @urganize/homepage shots`) needs a signed-in headed Chrome on a seeded demo team, which the sandbox the marketing loop runs in cannot do. Recommendation: run it once from your machine and commit the new images and `content/product-shots.ts`.
