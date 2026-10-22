# Annual only, at new prices (2026-09-08, shipped as v1.39.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder spec: move every tier to annual-only pricing at new rates, with no
monthly option anywhere. **Solo ₦5,000/year, Manager ₦22,000/year, Label
₦50,000/year, Group "Let's talk".** No migration, no new flag — the whole thing
rides `NEXT_PUBLIC_FEATURE_PRICING_V2`, which is already on in production, so it
is live at merge.

**RENUMBERED SIX TIMES ON ONE DAY — v1.32.0, v1.33.0, v1.36.0, v1.37.0,
v1.38.0, v1.39.0 — across seven merges of `main`, and the last three are the
useful record because of when they happened.** Built as v1.32.0, it sat
unmerged while another session shipped v1.32.0 and v1.32.1 on `main`;
renumbered to v1.33.0, and within the hour #568 took **v1.33.0**, the same
number and the same ledger date; renumbered to v1.36.0 after #569 (v1.35.0) and
#570 (v1.34.0) both landed; renumbered a fourth time when #572/#573 took
**v1.36.0**; a fifth when #571 took **v1.37.0** in the ~15 minutes it took
to merge, verify and push the fourth; and a sixth when #574 took **v1.38.0**
in the same window again. (A seventh merge, #575, was the only one that did
not collide — marketing-site only, so by the app-only scope rule it earns no
ledger entry and no bump.) `CURRENT_VERSION` derives from the changelog's top
entry, so merging on any of the six would have sent the product version
BACKWARDS. Nothing about the change itself moved any of the six times; only
the number and the ledger date.

**A branch that carries a version bump is perishable, and the last two
collisions measure how perishable.** The first three each took about an hour;
the fourth took minutes; the fifth landed *inside the merge that resolved the
fourth*. So "re-check `packages/changelog/src/index.ts` against `origin/main`
immediately before merging" is not a formality and not a once-per-session
check — it is what caught both, the second time against a base that had been
verified clean minutes earlier, in the same turn.

**The real fix is to stop claiming the number early:** a version bump wants to
be the LAST commit before merge, not part of the feature work, precisely
because several sessions can hold a claim on one number at once and none of
them can see the others. Everything else about a branch can wait; the number
cannot. **The corollary the last three add: on a busy day, budget for the re-check to
fail, and shorten the window it has to survive.** `main` landed a commit every
six to fifteen minutes that afternoon, while a merge-plus-gates-plus-wait-for-CI
cycle took about fifteen — so the branch lost the race by construction until the
wait was dropped. **The Vercel status is a PREVIEW DEPLOYMENT, not a test
suite** (this repo runs no GitHub Actions; the gates are local), so blocking a
merge on it buys nothing and costs exactly the minutes that let `main` move
again. Run the gates locally, push, and merge. The only thing that made seven
merges cheap at all was that the resolution rule never changed — main's entry
preserved byte-for-byte, mine renumbered above it.

**⚠️ READ THE ACTIVATION BLOCK AT THE END BEFORE MERGING.** Every amount moved
and a Paystack Plan's amount is fixed when the Plan is created, so three new Plan
objects have to exist. The code is built so that shipping first cannot overcharge
anyone, but it can leave the wall unable to take a card.

**Two calls were put to the founder before any of it was built, and both changed
what shipped:**

1. **Label is buyable by card again**, reversing the 2026-08-30 decision that
   made it sales-led with no price at all. The spec's own acceptance line —
   "three annual prices and one 'Let's talk' card" — only adds up that way, and
   reversing a nine-day-old founder call on my reading of an acceptance bullet
   was worth confirming rather than inferring. **Group came back onto the page in
   the same move** to be that one card; it had been off both surfaces since
   Label took the sales-led slot.
2. **"Distribution included" is printed as written, and it is a FOUNDER OVERRIDE
   rather than drift.** Urganize does not distribute music — no DSP integration,
   and third-party platform integrations are on the v1 out-of-scope list — so the
   line breaks the standing rule that the pricing page never names an unbuilt
   feature (`perks` says so in as many words). The real thing behind the word is
   the Metadata scene assembling the ISRC, UPC, splits and credits a distributor
   asks for. Honest wording was offered and declined. Recorded at
   `UNIVERSAL_HIGHLIGHTS` in `packages/pricing` so the next reader takes it back
   to him rather than quietly correcting it.

### Nine things worth knowing before editing this

1. **THE SHAPE IS THE ENFORCEMENT.** `prices` is `{ annual: TierPrice }`, not a
   `Record<BillingInterval, …>` with the monthly key left empty. There is no
   monthly figure in the data at all, `getTierPrice` answers null for any
   interval but annual, and `formatTierPrice` takes NO interval argument. The
   acceptance bar was "nowhere a monthly figure", and a type holds that better
   than a sweep of the call sites can.
2. **`BillingInterval` KEEPS 'monthly', and must.** Real rows in
   `subscriptions.billing_interval` hold it and those subscriptions still renew
   on a monthly cycle. What ended is SELLING one. `SELLING_INTERVAL` is exported
   so nothing has to write the literal, and `resolveBillingInterval`,
   `advancePeriodEnd` and `PERIOD_DAYS` are all untouched.
3. **`purchasableTiers()` NEEDED ONE MONTHLY CODE REMOVED, and that was the
   single sharpest way this reprice could have taken checkout down with no test
   failing.** It required BOTH a monthly and an annual Plan code, on the sound
   reasoning that the wall's interval toggle was always live. With the monthly
   prices gone that requirement makes every tier unpurchasable. Mutation-tested.
4. **NEW ENV VAR NAMES, AND THE NEWNESS IS THE SAFETY MECHANISM.** The live map
   reads `PAYSTACK_PLAN_{SOLO,MANAGER,LABEL}_YEARLY_NGN` — names nothing has
   set. Reusing `..._ANNUAL_NGN` would have been far worse than untidy: it is
   already set and points at the ₦80,000 Plan, so a deploy before minting would
   advertise ₦5,000 and charge ₦80,000. That advertise-versus-charge gap has
   shipped **five** times here, every time caught by a person. An unset name
   inverts the failure into a withheld card. **`_YEARLY_` is not `_ANNUAL_`**,
   they are English synonyms and different vars, and the old names now live in
   `SUPERSEDED_TIER_PLAN_CODE_ENV_VARS` where only the renewal sanity check reads
   them.
5. **`isGrandfatheredRate` is the "new prices only apply to new subscriptions"
   half, and it compares against `subscriptions.amount`.** That column is the
   last full period charge, written by the initial purchase and every renewal and
   deliberately NOT touched by a prorated top-up — so it means "what a period of
   this subscription costs", which is the question. **Nothing new is stored:** no
   column, no cutoff date, no flag, and it self-maintains through the next
   reprice because the comparison is always against whatever the package says
   today. It FAILS TOWARD GRANDFATHERED on every uncertainty, because wrongly
   refusing costs a support message while wrongly allowing takes the wrong amount
   of real money. One accepted false positive: between an upgrade and the next
   renewal `amount` still holds the old tier's price, so a second change inside
   one period refuses — which is also exactly when the founder still has a
   Paystack swap to perform by hand.
6. **THE PRICE LOCK IS A PROPERTY OF PAYSTACK, NOT OF THIS CODE.** A subscription
   is bound to its Plan when it is created, so repointing an env var changes what
   a NEW customer is charged and nothing about an existing one. The guard above
   exists for the one place our code could still get it wrong: quoting a plan
   CHANGE off list prices the account has never paid.
7. **A REAL BUG SHIPPED FOR A DAY INSIDE THIS WORK AND IS FIXED HERE.**
   `readSalesLedPlanName` did one lookup against the tier table, on the reasoning
   that every sales-led id is also a tier id. True, and not sufficient: `label`
   is a valid id in BOTH generations and they now disagree about it — the TIER is
   a ₦50,000 self-serve plan while the LEGACY `label` is still sales-led with
   `PAYSTACK_PLAN_LABEL_NGN` holding a mislabeled ₦750,000 Plan. One lookup
   answered "not sales-led" for both, so a flag-off request would have charged
   ₦750,000 while recording ₦800,000. It asks which generation the request is
   read in now. **The pinning test did not catch it** — it asserted "every
   sales-led legacy id is also a tier id", which stayed true the whole time — so
   it is rewritten to assert the thing that matters.
8. **ABSENT AND EMPTY NOW MEAN DIFFERENT THINGS on the wall's tier list.**
   `offeredTiers` read `fromServer && fromServer.length > 0`, so an empty list
   fell back to offering everything. Right for ABSENT (an older server, an
   unreadable payload, and a walled team must never be left with no way to pay);
   wrong for EMPTY, which is the server saying it cannot charge any of them —
   there the fallback turns a withheld card into a radio that ends in a 500. It
   matters most in exactly the window a reprice opens. When the list is empty the
   wall now says card payment is unavailable and points at the full-weight Talk
   to us card beside it, and the Subscribe button is HIDDEN rather than disabled
   (the seat-cap lesson: a greyed button with no explanation is worse than none,
   and here the server has already given the reason).
9. **`minimumTierWith` SKIPS SALES-LED TIERS NOW.** Its doc always said the
   answer is used as an upgrade target, and the skip was implicit only because
   the displayed order happened to carry no sales-led tier between 2026-08-30 and
   this change. Group rejoining the page made `minimumTierWith('sso')` start
   answering 'enterprise' for an entitlement nothing implements.

### Smaller decisions

- **"/year" spelled out, not "/yr"** (founder copy rule: fifth-grade readable).
- **`annualSavingCopy` and `ANNUAL_MONTHS_BILLED` are deleted**, along with every
  "2 months free" badge. There is no monthly figure left to save against.
- **`/pricing` went back to a SERVER component.** It only needed `'use client'`
  for the interval toggle's `useState`. Four cards now, `sm:grid-cols-2
  xl:grid-cols-4`, the shape this page used the last time it carried four.
- **`SELF_SERVE_TIERS` on the marketing page is derived from `contactSales`, not
  a hand-written Set.** It went stale the same day Label got a price — the card
  would have shown ₦50,000 above a "Let's talk" button. Same derivation the
  in-app wall already makes.
- **`BILLING_PLANS` (the legacy generation) is untouched**, and the legacy picker
  in `TeamWall` keeps its monthly figure. That branch only renders with pricing
  v2 OFF, which is the documented rollback state, and its numbers are what real
  legacy subscribers renew against. A comment at that JSX says so, so the next
  sweep does not "finish the job" by editing their prices.
- **`/terms` §04 moved with it**, since it is a contract: billed once a year
  rather than monthly-or-annually, and it now states the price lock outright.
  `LAST_UPDATED` bumped.
- **`/for-labels` stopped saying we price each roster deal by hand.** What
  survives is the part that was always the real substance of Label and is not
  self-serve at all: the founders set the roster up with you.
- **`/pricing`'s "How a demo works" became "How the Group plan works."** With
  Label back on a card checkout, Group is the only card those three steps
  describe.

### What "app store listing text" turned out to mean

The spec asks for it and **there is nothing in this repo to change.** No store
listing copy exists anywhere: `docs/mobile/codemagic-setup.md` says in as many
words that screenshots, descriptions and privacy answers are App Store Connect
and Play Console dashboard work, and the CI pipeline only builds and uploads the
binary. No store release has ever shipped either. So that item is a founder task
in those two dashboards, not a code change.

### Verified

**2995 tests passing** (up from 2983; ~35 rewritten across `billing-plans`,
`plan-change`, `entitlements`, `billing-summary` and `tier-limits-guard`, since
those files encoded the old contract), `eslint .` **byte-identical to the
measured clean-tree baseline** (3 errors / 81 warnings in `apps/web`, all
pre-existing in `WorkspaceView.tsx`; 0 / 2 in `apps/homepage`) with **zero** new
findings, `tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors, and `next build` green **by exit code** for
both apps with `apps/web` built in BOTH pricing-v2 states and `/auth`,
`/dashboard`, `/locked`, `/onboarding`, `/settings` all still `○ Static` in each.
`/pricing`, `/terms` and `/for-labels` still `○ Static` too.

**The acceptance bar was checked against the PRERENDERED HTML rather than the
source**, which is this repo's habit for anything a page renders: `/pricing`
and `/` each carry exactly `₦5,000/year`, `₦22,000/year` and `₦50,000/year`,
each prices Group as "Let's talk", and each has **zero** occurrences of
"Monthly", "/mo" or "months free". `/changelog` reads the new version.
**"Distribution included" is on `/pricing`'s four cards and deliberately not on
`/`** — the landing strip calls `tierHighlights(id).slice(0, 3)`, so the three
countable-limit lines fill the slice and the universal line falls off the end.
That slice is pre-existing (#481, the landing rebuild), and the strip is a
teaser rather than a second price table, so it is by design and not a gap.

**Two grep lessons from checking it, and they are the same lesson twice.** An
apostrophe in prerendered HTML is not one string: `/pricing` emits React's
hex-escaped `Let&#x27;s talk` (from the tier data's straight quote) while `/`
emits a typographic `Let’s talk` (a hand-written JSX string), so a grep for
either alone reports zero on the other page and looks like a missing card. And
a hit count is not a card count: `/pricing`'s two are the Group card's price
line **and** its CTA, while one of `/`'s two is the serialized RSC payload
rather than anything visible. Extract the region and strip the tags before
believing a count.

**Three mutation passes, each printing APPLIED first and each killing exactly its
own tests:** making `isGrandfatheredRate` fail open on an unreadable amount,
putting the monthly requirement back into `purchasableTiers`, and reverting
`readSalesLedPlanName` to its single lookup.

### Not verified

**Nothing has run against real Paystack or a real database.** No card has been
charged at a new price, no renewal has extended, no plan change has been quoted
or refused, and the grandfathered guard has only ever run as a pure function. The
wall has not rendered in a browser: this sandbox cannot mint a Supabase session
and has no route to either urganize domain (the proxy answers 403 to CONNECT).
The absent-versus-empty distinction in point 8 has no unit test either, because
it lives in a `useMemo` and this repo has no component tests.

### Activation — DO THIS BEFORE MERGING

1. ~~**Mint THREE new annual Paystack Plans**, in NGN: Solo ₦5,000/year, Manager
   ₦22,000/year, Label ₦50,000/year.~~ — **done 2026-09-09 (founder).**
2. ~~**Set `PAYSTACK_PLAN_SOLO_YEARLY_NGN`, `PAYSTACK_PLAN_MANAGER_YEARLY_NGN` and
   `PAYSTACK_PLAN_LABEL_YEARLY_NGN`** on the Vercel `Web` project.~~ — **done
   2026-09-09 (founder).** ⚠️ For anyone reading this later: `_YEARLY_` is not
   `_ANNUAL_`, and `PAYSTACK_PLAN_LABEL_YEARLY_NGN` is not
   `PAYSTACK_PLAN_LABEL_NGN` (that one holds a stale ₦750,000 Plan).
3. ~~**DEACTIVATE the old monthly and annual Plans in the Paystack dashboard, and
   do not delete them.**~~ — **done 2026-09-09 (founder).** Deactivating stops anyone new landing on one; the
   subscriptions already bound to them keep renewing at what they signed for,
   which is the price-lock half of the spec and needs no code.
4. **Leave the old `_ANNUAL_` and `_MONTHLY_` vars set.** They are read only by
   the renewal sanity check now, and clearing them makes a pre-reprice
   subscriber log a warning on every renewal.
5. Merge. The ledger entry and the version bump are already in this change,
   because pricing v2 is on and this is live the moment it deploys.
6. **Verify with a real card**: buy Solo, confirm Paystack quotes ₦5,000 and
   `subscriptions.billing_interval` reads `annual`; then confirm an existing
   paying account's next renewal still charges what it always did.

**The merge-early caveat is spent, and what it bought is worth recording.** It
read: merge before steps 1 and 2 and nothing breaks and nobody is overcharged,
because `purchasableTiers()` finds no code, the wall says card payment is
unavailable and points at Talk to us, and the public page shows the new prices.
That held. **The order it did NOT protect against is the one that happened:
config first, code second.** With the Plans minted and the `_YEARLY_` vars set
while the deployed build still read `_ANNUAL_`/`_MONTHLY_`, production was
selling the OLD prices against Plans that had just been deactivated — so the
window between the founder finishing activation and this merge landing is the
one genuinely exposed moment in the whole reprice, and it is short only because
the merge followed within the hour. **Next reprice: land the code first and set
the vars second.** New var names make that safe (an unset name withholds the
card), which is exactly what they are for.

### One thing to decide, which no code can settle

**The prices went DOWN, hard — Solo ₦80,000 to ₦5,000 a year, Manager ₦350,000 to
₦22,000 — so "existing paying accounts keep their current price" now works
AGAINST them.** A lifetime lock normally shields a customer from an increase;
here it holds a handful of accounts at up to sixteen times what a new customer
pays. The spec is explicit and this is built exactly as asked: nothing touches an
existing subscription, and `isGrandfatheredRate` refuses to quote them a
self-serve change, routing them to a human instead. That human can move anyone
down whenever you want (`/admin/teams` can mark a team paid at any amount). It is
an operations call rather than a code one, which is why it is written down here
rather than asked about.
