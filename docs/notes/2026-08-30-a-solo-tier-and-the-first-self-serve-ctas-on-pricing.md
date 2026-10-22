# A Solo tier, and the first self-serve CTAs on /pricing (2026-08-30)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: add a fourth, cheapest tier; move Manager one rung up; let the two
lowest tiers sign themselves up. The ladder is now **Solo → Manager → Label →
Group**, and Manager stops being the front door.

- **Solo:** ₦8,000/mo, ₦80,000/yr (the same 10× "2 months free" ratio every rung
  holds). 1 artist, 2 people, 1 release at a time, 40 UrgAns actions a month,
  plus files/credits/press kits, export and email support.
- **Manager:** audience moves from "one or two artists" to "two or more", and it
  gains an artist ceiling of 5. Prices, seats, releases and actions untouched.

**No changelog entry and no version bump.** Everything a user can see is on
`apps/homepage`, which the Versioning section's app-only scope rule excludes
("pricing display updates count as marketing"). The `apps/web` half is inert —
see the next point.

**Six things worth knowing before editing this:**

1. **SOLO IS ON THE PRICING PAGE BUT NOT ON SALE, deliberately** — the same
   staging Manager itself shipped in. It is absent from `SelfServeTierId`, has no
   Paystack Plan object, and is **not in `subscriptions_plan_check` or
   `subscriptions_pending_plan_check`**, so nothing can write `solo` to a
   subscription row, `resolveTeamTier` can never return it, and none of its
   ceilings can bite a real team. Its CTA is the free team trial, which needs no
   plan code. `entitlements.test.ts` carries the tripwire, pointed at
   `resolveCheckoutPurchase` rather than at a constant array — the lesson from
   2026-08-24, when the previous tripwire watched two arrays and missed `manager`
   becoming purchasable through a third branch. **Selling Solo means a migration
   widening BOTH plan constraints, two minted Plans, their env vars, and adding
   it to `SelfServeTierId` + `isRecurringPlan`** (skip that last one and renewals
   silently stop extending — a hazard this file already records twice).
2. **`limits.artists` is DECLARED AND NOT ENFORCEABLE, and "Up to 5 artists" is
   the one claim on this page that outruns the product.** Nothing can add a
   second artist to a team: a workspace resolves ONE `artists` row
   (`getWorkspaceArtist`), the create-release modal collects no artist input, and
   every release points at that same row — the one-artist rule is a UI fact, not
   a schema one (the schema has always permitted many). So Solo's ceiling of 1 is
   what every account already gets, and Manager's 5 describes the offer rather
   than a switch anyone can flip. It was a knowing exception to the standing
   "do not market multi-artist until the UI limit is lifted" note — raised with
   the founder before merge and shipped as asked, with the answer being "ship
   it, and build multi-artist next". **That follow-up SHIPPED the same day —
   see "Artist rosters" below — so this claim is true now**, and `artists` moved
   from declarative to a real `CountableLimitKey` enforced at both creation
   points. Left as written because the staging is the reusable part: a number
   can be published one day and enforced the next precisely because it lived in
   `limits` rather than in the card copy.
3. **The number still lives in `@urganize/pricing`, not in the card copy.**
   `artists` joined `TierLimits` beside the three enforced ceilings and
   `tierHighlights` derives its line, so the page quotes the same field a future
   check will read. A literal "5 artists" in JSX is exactly how a published
   figure drifts from a real one — the failure this repo has shipped four times
   with prices. `apps/homepage` cannot import from `apps/web`, which is why the
   countable limits live in the shared package at all.
4. **"1 artist" and "Up to 5 artists" are phrased differently on purpose.** The
   entry tier states what you get; the tier above states how far you can go.
   Normalising them would lose that, and the founder wrote both strings.
5. **The self-serve split is by who can be served without us in the room.** Solo
   and Manager send people to `APP_SIGNUP_URL`; Label keeps "Book a demo" and
   Group keeps "Let's talk", because a roster is still set up by hand. This
   NARROWS, and does not delete, the 2026-08-24 "every CTA on this page is a
   capture" rule — that comment is rewritten in place rather than left to
   contradict the code. The header's "Join the waitlist" became a trial CTA for
   the same reason; the in-body waitlist forms all stay. (This said the header
   reads "Start free trial". It never did — it read **"Start free"** until
   2026-09-11 and reads **"Try Urganize"** now.)
   **`APP_SIGNUP_URL` is `/onboarding`, never `/auth`** — `/auth` is login-only
   and has no signup form, so a "start" CTA pointed there lands people on a page
   with no way to create an account.
6. **Four cards go 1 → 2 → 4 columns** (`sm:grid-cols-2 xl:grid-cols-4`,
   container widened to `max-w-6xl`). Deliberately not four from `md`: at 768px
   that is ~170px a card, which wraps the price and every ceiling line. Below
   `sm` it still stacks to one column, which is where most of this traffic reads
   it.

Also reworded: the hero's "we still set every team up ourselves, so start with a
demo" line, which two of the four cards now contradict, and the footnote under
the cards, which states the trial terms (14 days, no card) beside the button that
starts one — the same terms `/signup` and `TEAM_TRIAL_DAYS` carry, so all three
move together.

- **Verified:** 1669 tests (4 new), `eslint .` at the exact baselines in both
  apps (web 3 errors / 65 warnings, all pre-existing in `WorkspaceView.tsx`;
  homepage 0 / 2), and `next build` green **by exit code** for both apps with
  `/pricing`, `/auth`, `/onboarding` and `/settings` all still `○ Static`. The
  prerendered `/pricing` HTML was parsed rather than trusted: cards in the order
  Solo, Manager, Label, Group; CTA anchors resolving to onboarding, onboarding,
  the Label mailto and the Group mailto; "Join the waitlist" gone from every
  page's header. Compiled CSS confirms `sm:grid-cols-2` at 40rem and
  `xl:grid-cols-4` at 80rem, and every tier amount is in the client bundle
  (`8e3`/`8e4` for Solo), which is what makes the interval toggle real for it.
- **Not verified:** nothing was seen in a browser, so the four-across row at
  ≥1280px has never been laid out for real — that is the one thing worth a look,
  since it is the width where the price string is tightest. This sandbox cannot
  reach either urganize domain (the proxy answers 403 to CONNECT), so the signup
  destination is confirmed from `lib/app-urls.ts` and the `/onboarding` route
  existing and server-rendering its real form, not from opening it.
