# Plan changes and proration (2026-08-24)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The last item in the pricing spec. A paying team can move between tiers; an
upgrade charges the difference for the days they have left, a downgrade waits
for the period they already paid for. Behind `NEXT_PUBLIC_FEATURE_PRICING_V2`
(the route 404s when off).

### Paystack has no plan-change endpoint, and that shapes everything

There is no plan-swap call and no proration primitive. A change means **disabling
the old subscription and creating a replacement**, and the founder does that by
hand (founder call). The app records the decision, takes the money an upgrade
owes, switches entitlements, and tells the founder what is now due at Paystack.

**Why not automate the swap.** Its worst failure is disabling a subscription and
then failing to create its replacement: the team keeps working, nothing looks
wrong, and access lapses months later with no charge having been attempted. A
human doing it cannot fail that way silently. The cost of the choice is a
deadline the founder has to hit, so the deadline is stated in three places — the
alert email's subject and body, `billing_events`, and a **SWAP OWED** line on
`/admin/teams`. An email is one chance to notice; a wrong charge is not
recoverable by noticing later.

### The policy

- **Upgrade**: charge `(target price − current price) × unused fraction of the
  period`, once, now. **`expires_at` never moves** — they already paid for this
  period and are topping it up, not rebuying it. The new tier's limits apply the
  moment the charge clears.
- **Downgrade**: nothing is charged and nothing is taken away early. The target
  waits in `pending_plan` and the renewal applies it.

### Six things a later change will be tempted to get wrong

1. **This is NOT `start-checkout` with a different body**, which is the obvious
   shape and is wrong twice over. That route initializes *with a plan code*, so
   Paystack opens a **second subscription** on the same customer — and
   `subscription.create` matches on `paystack_customer_code`, so the new code
   overwrites the old one on our single row and orphans a subscription that keeps
   billing. It also recomputes `expires_at` from scratch, discarding the period
   already paid for. The change route initializes with **no plan param** (the
   card-verification charge's shape) so it is a one-off top-up.
2. **`paystack_subscription_code` is CLEARED when a change is recorded, and that
   is load-bearing.** `handleSubscriptionDisable` stamps `status: 'cancelled'` on
   whatever row matches a disabled code — so when the founder disables the old
   subscription as part of the swap, an un-cleared code would turn a healthy
   upgraded team into one whose Settings reads "Cancelled, access until …". A
   renewal arriving in the window still matches: the webhook falls back to
   `paystack_customer_code`.
3. **No new `status` value, ever.** `resolveSnapshot` grants access only for
   `active | cancelled | past_due | trialing | free_trial`; a `'changing'` status
   would read as expired and lock every changing team out of the product, as well
   as violating `subscriptions_status_check`. A team changing plan is a paying
   customer with nothing wrong, so their status stays `active`.
4. **The paid-upgrade webhook branch must divert BEFORE the recurring branch**,
   for a different reason than the card-trial divert beside it: `plan` on a
   plan-change payments row IS a real tier id, so `isRecurringPlan` accepts it
   and `applyInitialOrManualCharge` would upsert a fresh `expires_at` — throwing
   away the period the upgrade promised not to touch. Keyed on the jsonb
   `source`, not on `plan`.
5. **`applyInitialOrManualCharge` clears the pending fields.** Without it, a team
   whose period lapsed with a downgrade pending would re-activate on the tier
   they just bought and then be silently moved off it at the next renewal, by a
   request they made months earlier.
6. **The prorated fraction is clamped to 1, over a NOMINAL period** (30 days /
   365). Measuring the real length by subtracting an interval from `expires_at`
   clamps on short months, so a period ending March 3 would measure as 28 days
   when it was 31 — making the fraction too big and the charge too high. Nominal
   is predictable and explainable in one sentence. Both facts are
   mutation-tested: removing the clamp fails two tests.

### What it refuses, and why refusing is the answer

`quotePlanChange` refuses an **interval change** (monthly to annual means buying
a year, which restarts the period — the policy the founder explicitly did not
pick), a **sales-led target** (no price to prorate), and any **legacy or
grandfathered current plan** (CLAUDE.md already records that the displayed
amounts are today's LIST prices, not necessarily what an account pays, so the
credit side would be a guess). Each refusal names the next step, and a test
asserts none of them is a dead end. At this scale a conversation beats a
confident wrong number.

A prorated amount below Paystack's practical floor is **granted free** rather
than charged — otherwise a team upgrading on the last day of a period gets a
broken checkout to buy a few hours. A test sweeps a whole period to prove no
hour produces an amount Paystack would reject.

### Two live bugs fixed on the way

- **Settings' "Change plan" button was a dead round trip.** It pushed a bare
  `/locked`, whose has-access effect immediately replaced a paying team back into
  the app. The identical bug `UrgansUsageStrip` had before it was given
  `?intent=upgrade`; `'change'` now carries the same param.
- **The renewal ack reported the plan the team was leaving.** A pending downgrade
  applies at that exact moment, so it now reports the plan it ended on.

### Verified

**1146 tests** (28 new), `eslint .` at the exact **3-error / 66-warning**
baseline, `next build` green **by exit code** in both flag states with `/auth`,
`/onboarding` and `/settings` still `○ Static`. Runtime probes, rebuilding
between them: flag off `/api/billing/change-plan` **404**s while
`/api/billing/start-checkout` still **401**s; flag on it **401**s — the
404-vs-401 discrimination is what proves the gate rather than a routing accident.
Mutation-tested: removing the fraction clamp, and letting a legacy plan through
the refusal, each fail exactly the tests written to catch them.

**Not verified, and this is the significant gap.** Nothing has run against real
Paystack or a real database: no proration has been charged, no webhook delivered,
no downgrade applied at a renewal, and the founder's manual swap has never been
performed against a row this code wrote. The arithmetic rests on unit tests, and
the sequencing on traced call paths. Worth a real pass once a tier subscription
exists: upgrade a Manager team mid-period, confirm Paystack quotes the difference
rather than the full price, confirm `expires_at` did not move, then check
`/admin/teams` shows the SWAP OWED line.

### Still not built, deliberately

An interval change, which is a founder conversation by design rather than an
omission. (Read-only-on-payment-failure, the other item this section used to
name, shipped 2026-08-24 — see the section immediately below.)
