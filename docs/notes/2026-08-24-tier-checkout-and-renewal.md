# Tier checkout and renewal (2026-08-24)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The follow-up the enforcement PR flagged as blocking the pricing-v2 flag. Two
pre-existing bugs, one root cause: **under the tier model `subscriptions.plan`
holds a TIER and no longer encodes the billing interval, and nothing stored the
interval.** Every function that switched on the plan *name* predated tiers.

What that actually cost, had the flag been flipped: `getPlanExpiry` gave a
**Label-monthly buyer a full year** (the legacy `label` plan billed annually, so
the name matched) and a **Manager-annual buyer one month** (no match, so the
monthly default). And `isRecurringPlan` rejected `manager`, so the webhook's
renewal branch bailed at `non_recurring_subscription` and **renewals silently
stopped extending**. Both invisible only because no code path could write a tier
id.

Founder calls: **API only** — `/locked` keeps its legacy picker, so this makes
tier checkout *correct*, not *reachable*; and **fix the plan-naming copy here**.

### Where the interval lives, and why it is two places

- **Checkout → webhook** rides `payments.paystack_response.selected_interval`,
  beside the `plan` column the webhook already treats as the trusted source
  (both written server-side by us, not echoed back from Paystack). No migration.
- **Webhook → renewal** needs `subscriptions.billing_interval`
  (`20260824100000_subscriptions_billing_interval.sql`). A renewal has **no
  payments row** — Paystack mints a fresh reference per invoice, so the webhook
  matches on `paystack_subscription_code` and reads only the subscription row.
  There is no jsonb column there, so this had to be real. Nullable, and null is
  meaningful: "infer from the plan name", which is exactly right for every
  pre-existing row.

**`resolveBillingInterval` is the single place the ambiguity is settled**: a
stored interval wins, else legacy plan-name inference, else **monthly**. That
default direction is deliberate — under-granting a month is recoverable at the
next renewal, over-granting a year gives away eleven months with no way to claw
it back.

### Five things a later change will be tempted to get wrong

1. **`advancePeriodEnd`'s extend-from-previous-end semantics are NOT a bug.**
   The `setMonth` clamp drift recorded under "The other two caps" is why a period
   START cannot be derived backwards; storing the interval is the fix for that.
   Advancing forward from the prior end is correct as written (a late renewal
   must not shorten a paid window), and "fixing" the clamp would move real
   billing dates.
2. **The `label` id exists in both generations and needs no feature flag to
   disambiguate — for a stored value.** Legacy Label was the sales-led
   ₦800,000/yr roster plan; tier Label is the self-serve flagship. A stored
   `label` can only be the tier, because the id was never in
   `subscriptions_plan_check` until the tier migration added it and
   `PAYSTACK_PLAN_LABEL_*` has never been set, so checkout 500s before the
   constraint could be reached. `20260823100000_pricing_tiers.sql` already
   relies on that same fact. This is why `billing-summary.ts` resolves
   tier-first with no env read — it is documented as client-safe and reads no
   flags, and it does not need one.
3. **⚠️ Label's Paystack plan codes point at `PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN`,
   NOT `PAYSTACK_PLAN_LABEL_*`.** The tier's prices are byte-identical to the
   legacy monthly/annual amounts by design, which is the entire reason the tier
   rollout mints no new Plans for it and no subscriber changes price.
   `PAYSTACK_PLAN_LABEL_NGN` holds a mislabeled ₦750,000 Plan from an earlier
   attempt. There is a test for this, because it is a trap.
4. **`planCodeMatchesSubscription` resolves FORWARD (stored plan → expected
   code), and must keep doing so.** The obvious version reverse-maps the
   incoming code — but because Label reuses the legacy Plans, one code
   reverse-maps to both legacy `monthly` and `label` at monthly, so a reverse
   lookup would warn on **every Label renewal**. `identifyPlanByCode` is
   deliberately left legacy-only and is no longer the comparison.
5. **`enterprise` is excluded from `isRecurringPlan` and has no plan code.** It
   is quoted per contract and invoiced by hand, so a charge event must never
   reach the renewal math with it; `getPlanExpiry` pegs it far-future like
   `custom` as a belt-and-braces measure if one ever does.

### Two smaller decisions

- **Tier checkout is NGN-only and refuses USD plainly.** `PRICING_TIERS` carries
  NGN prices alone, the Paystack account offers NGN only in plan creation, and no
  `PAYSTACK_PLAN_*_USD` var has ever been set. Getting one step further before
  failing would be worse than a clear 400.
- **`resolveCheckoutPurchase` was extracted into `lib/billing-plans.ts`** rather
  than left inline in the route. It decides which Paystack Plan a card is charged
  against and for how long, and the route is unreachable from a test without
  mocking Supabase and fetch — so the decision lives where vitest can see it and
  the route is a thin caller. Its error precedence is tested: a malformed request
  is answered before an unconfigured Plan, so nobody is ever told "plan not
  configured" for a request that was invalid to begin with.

### Copy layer

`describePlanName` and `isContactSalesPlan` are tier-first now, and
`payment/callback` calls the shared helper instead of repeating a legacy-only
line. Before this, a paying Manager customer's Settings read "Active plan" with
no name, and a lapsed Label subscriber was pointed at a mailto instead of the
checkout they were trying to reach. **Two existing tests were inverted on
purpose** (`isContactSalesPlan('label')` was asserted true) — the assertion
encoded the legacy meaning, and the comment beside it records why it flipped.

### Verified

**1110 tests** (34 new), `eslint .` at the exact **3-error / 66-warning**
baseline (all three errors pre-existing in `WorkspaceView.tsx`), `next build`
green **by exit code** with pricing v2 off and on under production config
(`NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true`), and `/auth`, `/onboarding`,
`/settings` still `○ Static` in each. **Mutation-tested rather than merely
asserted:** making `resolveBillingInterval` ignore the stored interval, and
dropping `manager` from `isRecurringPlan`, each fail exactly the tests written
to catch them (six failures across the two, green again on revert).

**Not verified, and this is the significant gap:** nothing has run against real
Paystack or a real database. No charge, no webhook delivery, no renewal, no
`billing_interval` row. The route's own validation cannot even be probed from
outside — auth correctly runs first, so an unauthenticated request 401s before
reaching the plan branch — which is precisely why the decision was extracted
into a unit-tested function. Worth one real end-to-end pass once Manager's
Paystack Plans exist: buy Manager monthly, confirm `expires_at` lands one month
out and `billing_interval` reads `monthly`, then buy Label annual and confirm a
year.
