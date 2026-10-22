# Group tier removed; "Most teams" moved to Solo (2026-09-09, shipped as v1.40.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call, one day after Group ("Let's talk", id `enterprise`) rejoined the
ladder in the annual-only reprice above: remove it entirely, not merely take it
off the page or flag it dark. Then move the "Most teams" recommended badge from
Manager to Solo. Both are copy-and-type changes with no migration and no new
flag — the pricing package and its five downstream consumer modules already
carry every mechanism this needed.

**THE INSTRUCTION WAS "REMOVE ENTIRELY", AND THAT IS A DIFFERENT ASK FROM EVERY
PREVIOUS GROUP CHANGE ON THIS LADDER.** Group had already been added, taken off,
added back and repriced-around three times in nine days (2026-08-30 add,
2026-09-02 to -08 off while Label held the sales-led slot, 2026-09-08 back on
for one day). Every one of those was a DISPLAY change — `PRICING_TIER_ORDER`
gained or lost an entry while `PRICING_TIERS.enterprise` kept existing
underneath. This is not that: `'enterprise'` is gone from the `PricingTierId`
UNION TYPE itself, so nothing anywhere in the codebase can construct, store, or
render one any more — not behind a flag, not hidden from an array, deleted.

### Six things worth knowing before touching this again

1. **THE SHARPEST BEHAVIOURAL CONSEQUENCE: a stray `'enterprise'` string is no
   longer "sales-led", it is UNRECOGNISED.** Every gate that used to answer
   "yes, and here is why" for that string now answers "no, never heard of it" —
   because each one keys off `isPricingTierId`/`isBillingPlanId`, and neither
   recognises a string that was removed from the type entirely.
   `resolveCheckoutPurchase({ plan: 'enterprise', ... })` used to refuse with
   *"Group is quoted per contract..."*; it now refuses with the generic
   *"plan must be..."* message, same as any garbage string. `isContactSalesPlan`
   used to be `true` for it; it is `false` now, and — because Label is
   self-serve again and nothing else is sales-led — **`isContactSalesPlan`
   currently returns `false` for every real input that exists.** The function
   and the `contactSales` field it reads both stay as generic infrastructure for
   whenever a sales-led tier returns, per the removal note in
   `packages/pricing/src/index.ts`, but there is nothing left today for either
   to say yes to.
2. **`quotePlanChange`'s refusal reason is UNCHANGED for this string, but for a
   different reason now.** It refuses a target tier with `!isPricingTierId(target)`
   BEFORE it ever checks `contactSales`, so `'enterprise'` and a genuinely
   made-up id like `'platinum'` hit the exact same branch and the same
   `'sales_led_target'` reason code. That reason code already meant "not a real,
   buyable tier" more than it meant "sales-led specifically" — Group's removal
   just makes that the only reading left.
3. **TWO THINGS WERE DELIBERATELY LEFT ALONE, both defensive rather than
   load-bearing.** `subscriptions_plan_check` (the Postgres CHECK constraint in
   `20260823100000_pricing_tiers.sql`) still PERMITS the string `'enterprise'` —
   no migration narrows it, because narrowing a constraint read by every billing
   path is real risk for a value nothing writes any more, and the existing
   fail-open behaviour already covers a stray row safely (see point 4).
   `getPlanExpiry` in `billing.ts` also still checks
   `plan === 'custom' || plan === 'enterprise'` as a **plain string comparison**,
   unrelated to `isPricingTierId` — untouched on purpose, so a pre-2026-09-09 row
   that somehow still carries `'enterprise'` keeps its far-future expiry instead
   of falling through to a one-month default.
4. **`resolveTeamTier` was ALREADY safe for this before today, and stays
   safe.** `isPricingTierId('enterprise')` now returns `false`, so it falls
   through to the same "unknown plan" branch every other retired legacy id
   takes, resolving to `'label'` (uncapped) rather than throwing. Nothing had to
   change in `entitlements.ts` for this — it was already written to fail open on
   an unrecognised plan, and Group's removal just moved which branch catches it.
5. **`isRecurringPlan('enterprise')` and `isSelfServeTier('enterprise')` were
   ALREADY `false` before today**, since neither function's literal-comparison
   list ever included `'enterprise'` even while the tier existed (it was
   `contactSales`, so it was never recurring or self-serve in the first place).
   Their behaviour for this string is unchanged; only the comment explaining WHY
   moved from "it's sales-led" to "it no longer exists, and this is now a
   defensive branch for a stray pre-removal row."
6. **The "Most teams" badge move is the simple half.** `recommended: true` moved
   from the `manager` entry to the `solo` entry in `PRICING_TIERS`. Every
   consumer (`TeamWall.tsx`'s `DEFAULT_TIER`, `PricingTierCards.tsx`,
   `PricingStripSection.tsx`) already reads `tier.recommended` rather than
   hardcoding a tier name, so this needed no consumer-side changes beyond
   `TeamWall.tsx`'s `DEFAULT_TIER` constant (which tier).

### Every test file touching a tier was rewritten, not patched

`entitlements.test.ts`, `billing-plans.test.ts`, `tier-limits-guard.test.ts`,
`billing-summary.test.ts`, `plan-change.test.ts` and `billing.test.ts` all had
assertions built on Group actually existing (`PRICING_TIERS.enterprise.label`,
`for (const tier of ['label', 'enterprise'])`, an expected `'contact'`/`'Group'`
CTA or error string). Each was rewritten to assert the new reality — mostly "a
stray `'enterprise'` value now behaves like any other unrecognised plan" — rather
than deleted, since a stray legacy row reaching one of these functions is a real
scenario worth a test even though nothing writes the value any more.

### Verified

The full vitest suite (3190 passing, 30 skipped — apps/web), `eslint .`
**byte-identical to a freshly-stashed clean-tree baseline in both apps**
(3 errors / 78 warnings in apps/web, all three pre-existing in
`WorkspaceView.tsx`'s single-release auto-scope ref access; 0 errors / 2
warnings in apps/homepage, the pre-existing `RoadmapPageClient.tsx` finding)
with **zero new findings** in either — confirmed by stashing this work,
re-linting the reset branch, and comparing counts rather than trusting a
remembered number, since `origin/main` had moved one commit (an unrelated
guided-tours feature, #576) between this branch's base and this work landing.
`tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors. `next build` green **by exit code** for both
apps, with `/auth`, `/onboarding`, `/settings`, `/dashboard` (apps/web) and
`/pricing`, `/for-labels`, `/` (apps/homepage) all still `○ Static`.

**Not verified:** nothing has run against real Paystack or in a browser. No
checkout was attempted, the wall has not rendered, and the four-card-to-three-card
collapse on `/pricing` plus the badge's move to Solo on `TeamWall` rest on the
build and the copy sweep, not on anything observed. Worth one look after deploy:
open `/pricing` and confirm three cards with "Most teams" on Solo, and open the
in-app wall as a walled team and confirm the same.
