# The app uses the logo's lettering (2026-11-15, v1.285.4, #1307, no flag)

Founder approved (mock: `docs/mocks/home-logo-font/mock.html` on `design/main-screens-1175`). Part of #1175.

- **Body and UI:** DM Sans (`--font-sans`). One variable file covers 400 to 700.
- **Headings and big numbers:** DM Sans Bold (`--font-display`), tracking -0.02em.
- **Dates, counts, statuses:** DM Mono 400 and 500 (`--font-mono`).
- Instrument Sans, Young Serif and Space Mono are no longer loaded. `app/layout.tsx` makes `--font-dm-sans` and `--font-dm-mono`; `globals.css` binds the three semantic variables.

## How display text gets its weight

Young Serif had one weight, so about 230 call sites pair `font-display` with `font-normal`, `font-medium` or `font-semibold`, and none of it meant anything. Nothing was changed at those call sites. Instead, in `globals.css`, after Tailwind's utilities:

- `.font-display { font-weight: var(--font-display-weight) }` wins over any weight class on the same element, so display text is always bold.
- `:where(.font-display) { letter-spacing: var(--font-display-tracking) }` has no specificity, so a `tracking-*` class on the element still wins.
- `h1` to `h4` take the same weight; a weight class on a bare heading (no `font-display`) still wins, as before.

Traps:

- A **variant** such as `lg:font-display` does not match `.font-display`. Add `lg:font-bold lg:tracking-[-0.02em]` beside it (see `DistributionPlanCard.tsx`).
- Raw CSS that names `var(--font-display)` must set the weight itself (`tour-loops.css`, `plan-picture.css`, `desk.module.css`).
- DM Mono stops at 500. `.font-mono { font-synthesis-weight: none }` makes `font-bold` on metadata fall to the real 500 instead of a faked bold.

## Not changed (follow-ups)

These draw pictures or mail with their own font files or names, and still use Young Serif and Space Mono:

- `lib/recap-fonts.ts`, `lib/recap-card.tsx` (recap card), `lib/social-share-card.tsx`, `lib/social-share.ts` (share posters), `app/p/[slug]/card/route.tsx`; TTFs in `apps/web/assets/fonts`. `lib/recap-render.test.ts` pins those names.
- The share image `opengraph-image.jpg` (made by `scripts/generate-og-image.mjs`).
- Auth emails in `supabase/templates/*.html` (installed through the Supabase API, not from the repo).
- The marketing site (`apps/homepage`).

## Checked

Before and after measurements of every text element (new truncation, extra lines, sideways scroll) on the live signed-in app with the new fonts applied in the browser only: Home, AI, a rollout, the task pop-up, Settings, Team, an artist page, at 1024, 1280, 1440 and 375. One regression: on Home at 1024 the "130 open · 42 late" line on a team card wraps to two lines (left for the Home rebuild). Not checked by eye: screenshots, dark mode, onboarding past sign-in.
