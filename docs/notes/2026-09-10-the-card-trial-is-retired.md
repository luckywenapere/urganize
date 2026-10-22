# The card trial is retired (2026-09-10)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report, from a real signup on a phone: the prices on `/start-trial`
"have not changed in app to match the new pricing", and then **"Couldn't
confirm payment — that card couldn't be saved for future billing"** when they
tried to start the trial. Two symptoms, one root cause.

**`/start-trial` was the last live checkout still reading the frozen legacy
price table.** `StartTrialPageClient` renders `getPlan('monthly'|'annual')`
from `BILLING_PLANS` and charges the matching legacy Paystack Plans through
`PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN`. Every reprice since pricing-v2 went into
`PRICING_TIERS` instead — that table is deliberately frozen, and its own
comment says why ("editing BILLING_PLANS would change what a real checkout
advertises"). Nobody noticed that the sentence had stopped being a reason to
leave it alone and become a description of a bug:

| | `/start-trial` showed | What the product sells |
|---|---|---|
| Intervals | Monthly **and** Annual | Annual only, since 2026-09-08 |
| Price | ₦80,000/mo · ₦800,000/yr | Solo ₦5,000 · Manager ₦22,000 · Label ₦50,000 /yr |
| Trial | 28 days, card required | 3 days, card-free (`TEAM_TRIAL_DAYS`) |

₦800,000 against Solo's ₦5,000 is **160×**, and monthly is an interval that no
longer exists in the data at all (`PricingTierDefinition.prices` is
`{ annual }` — the shape is the enforcement).

**The founder call: turn `NEXT_PUBLIC_FEATURE_CARD_TRIAL` off.** Both symptoms
go with it — the wrong prices become unreachable, and no card is collected so
the card-save failure cannot happen. New signups fall to the 3-day team trial
plus the hard wall, which is the newer decision and the one already announced.

**The clinching argument was the ledger's own words.** v1.41.0 reads *"The free
trial is now 3 days instead of 14. Same terms otherwise: your whole team, **no
card**."* That entry shipped the same day this report came in, so the card
funnel being on is what made an announced promise false. **So there is no new
ledger entry for the flip and no version bump: it delivers what v1.41.0 already
says rather than announcing anything.**

### Five things worth knowing

1. **⚠️ THE FLIP DOES NOT CANCEL PAYSTACK SUBSCRIPTIONS THE FLOW ALREADY
   CREATED, and this was NOT hypothetical — the audit found one.** A successful
   card trial writes `subscriptions.status = 'trialing'` AND creates a remote
   Paystack subscription whose `start_date` is trial end, so anyone who got
   *through* is charged the legacy amount on their day 28 whatever this flag
   says. **The founder's query returned one row: `plan: annual`, amount
   ₦800,000, `SUB_zogd3gidljj5h3n…`, still `trialing`.** Left alone, day 28
   fires a `charge.success` with a fresh reference, which matches by
   `paystack_subscription_code`, takes the ordinary renewal path, and bills that
   customer **₦800,000 for a plan the ladder no longer contains** — 16× Label's
   real ₦50,000. Turning a funnel off is not the same as unwinding it.

   **The fix is to disable it at Paystack, and the app handles the rest
   correctly with no code change** (verified rather than assumed):
   `subscription.disable` → `handleSubscriptionDisable` stamps
   `status: 'cancelled'` and **keeps `expires_at`** → `resolveSnapshot` grants
   access for `cancelled` while not expired. So that customer keeps the trial
   they were given, to the day it was going to end, and then meets the wall at
   real prices. Nobody is charged and nobody is cut off early.
   `POST /api/billing/cancel-trial` reaches the same end from inside the app and
   is deliberately un-flag-gated for exactly this rollback.

   Audit with:
   ```sql
   select s.user_id, p.email, s.plan, s.amount / 100.0 as naira,
          s.paystack_subscription_code, s.expires_at
   from public.subscriptions s
   left join public.profiles p on p.id = s.user_id
   where s.status = 'trialing'
   order by s.started_at desc;
   ```
   Each row needs its Paystack subscription disabled by hand, or that customer
   is billed at a price we do not sell.

   **DONE 2026-09-11, and the audit query now returns the same one row with
   nothing left to do to it.** `SUB_zogd3gidljj5h3n` was disabled at Paystack
   (`POST /subscription/disable`) and reads `non-renewing`, so the 2026-09-30
   charge will not fire. It had **0 invoices ever raised**, so that customer has
   never paid us anything and there was nothing to refund. Their access is
   untouched: the app row still reads `status: 'trialing'` with `expires_at`
   2026-09-30 intact, and `resolveSnapshot` (`subscription-access.ts:166`) maps
   `trialing` + not expired to `free_trial` — so they keep everything to the day
   it was always going to end, and then meet the wall at real prices.

   ⚠️ **The app row was NOT restamped to `cancelled`**, which is what the
   paragraph above predicts the `subscription.disable` webhook would do. Either
   it had not arrived when this was checked, or it does not fire for this
   transition. It makes no difference to the customer — `trialing` and
   `cancelled` both grant access while not expired — but **do not read
   `cancelled` as proof that a disable landed.** Read Paystack; the app row is
   not the record of it.

   The only other live subscription on the account is `SUB_9zh3as2lfeeb1th`, the
   founder's own ₦8,000/mo row, sitting in `attention` (Paystack cannot charge
   the card). Left alone deliberately.
2. **`POST /api/billing/cancel-trial` is deliberately NOT flag-gated**, and
   this is exactly the rollback it was written for: "an in-flight trial must
   stay cancellable after a rollback — money is on the line". Do not tidy a
   flag check into it.
3. **The funnel is retired, not deleted, and reviving it is a rewire rather
   than a flag flip.** The precondition is moving the picker, the checkout
   route's plan validation, the webhook's plan resolution and subscription
   create, `subscriptions.plan`, and the recorded amount onto
   `purchasableTiers()` at `SELLING_INTERVAL`. Recorded at both sites
   (`lib/trial-card.ts`'s header and `StartTrialPageClient`'s) rather than only
   here, because a flag flip is a dashboard action and whoever takes it reads
   the code, not this file.
4. **Nothing else forces the flag on:** `.env.example` documents it commented
   out as `false`, `isCardTrialEnabled()` requires the literal string `'true'`,
   and it is declared in `turbo.json`. So an explicit Vercel value is the only
   thing that can revive it.
5. **The 28-vs-3 day split is not drift to reconcile by picking one number.**
   `TRIAL_DAYS = 28` belongs to this retired funnel and is still load-bearing
   copy for anyone mid-trial; `TEAM_TRIAL_DAYS = 3` is the live one. They mean
   different things and must not be merged.

### The failure copy was blaming the customer, and that is fixed

`failTrialCardCharge` writes one of three reasons and the callback page
rendered the same sentence for all three: *"That card couldn't be saved for
future billing… Try a different card."* Only `card_not_reusable` is about the
customer's card. `subscription_create_failed` and `plan_unresolvable` are our
own Paystack plan config, and there "try a different card" is advice that
cannot succeed however many cards they own — it sends someone round a loop
instead of to us. Fixed regardless of the funnel's fate, because the copy is
wrong either way:

- **`classifyTrialCardFailure` is COARSE ON PURPOSE.** It crosses
  `/api/payments/verify`, which is **unauthenticated** and keyed only on a
  query-string reference, so it is an allowlist of two values rather than the
  stored reason — and `failure_detail`, which can carry a Paystack message,
  never leaves the server. The `lib/upload-failure-report.ts` posture: a string
  designed to be read by a stranger has to be safe to hand a stranger.
- **An unrecognised reason classifies as `'setup'`, never `'card'`.** A reason
  we do not know is not evidence the customer did anything wrong.
- Mutation-tested both ways: blaming every reason on the card fails 2 tests,
  and putting "try a different card" back into the setup copy fails 1.

**ANSWERED, from the founder's own query the same evening:
`subscription_create_failed`, one row, and it is the only failure on record.**
So the card was never at fault — the ₦100 charge succeeded, and Paystack
refused to create the delayed subscription against the plan code we handed it
(`PAYSTACK_PLAN_ANNUAL_NGN`, the legacy ₦800,000 Plan from 2026-08-22). That is
precisely the case the old copy got wrong, and this user is the one who read
it.

**AND THE BLAST RADIUS IS CONFINED TO THIS FUNNEL, which is the reassuring
half.** Checked rather than assumed: `TIER_PLAN_CODE_ENV_VAR` points every
sellable tier at `PAYSTACK_PLAN_{SOLO,MANAGER,LABEL}_YEARLY_NGN` — names
nothing had set before 2026-09-08, chosen for exactly this class of reason
("the newness is the safety mechanism"). Only the retired card funnel still
reads `_ANNUAL_`, so no live checkout shares the broken plan and the flag flip
closes the whole exposure. Note `_YEARLY_` is not `_ANNUAL_`: synonyms in
English, different vars here.

**What is STILL open is Paystack's own message, and it is worth reading even
though the flip makes it moot**, because it decides whether reviving the funnel
needs more than a reprice. "Plan not found" means the legacy Plan was
deactivated or is in the wrong Paystack mode — config, already handled. Anything
about `start_date` or the request body means
`buildDelayedSubscriptionPayload` itself is wrong (it sends
`toISOString()`, milliseconds included) and would fail again on any revival.
The column was truncated on the founder's phone; it is one field:

```sql
select paystack_response->>'failure_detail' as detail
from public.payments
where plan = 'trial_card' and status = 'failed'
order by created_at desc limit 1;
```

The original query, for the record — `plan_unresolvable` was nearly ruled out
before it ran, since `/api/trial/start-checkout` already 400s on an
unresolvable plan code before Paystack is touched:
```sql
select created_at, reference, status,
       paystack_response->>'failure_reason' as reason,
       paystack_response->>'failure_detail' as detail
from public.payments
where plan = 'trial_card' and status = 'failed'
order by created_at desc limit 20;
```
`card_not_reusable` means the card; `subscription_create_failed` means our
Paystack plan, with `detail` carrying Paystack's own message — and a stale or
deactivated legacy Plan, or a test/live mode mismatch, is exactly what the
reprice would have produced. Vercel logs carry the same line under
`[trial-card] charge failed`.

### Verified

3197 tests (+7 against a **measured** clean-tree baseline of 3190), `eslint .`
**byte-identical** at 3 errors / 78 warnings with zero new findings,
`tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors, and `next build` green **by exit code** with
`/start-trial` and `/payment/callback` both still `○ Static`.

**Not verified:** the copy has not rendered in a browser, and it cannot be
without a failing card trial against live Paystack — which the flip removes the
ability to produce. It rests on the unit tests plus a traced read of the
callback's failure branch. **The flip itself is a Vercel dashboard change and
needs a deploy that rebuilds `apps/web`** (`NEXT_PUBLIC_*` is inlined at build
time — the documented `turbo-ignore` trap), so confirm `/start-trial` bounces to
the dashboard before believing it took.
