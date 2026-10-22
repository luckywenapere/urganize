# Solo became a real tier (2026-09-01, v1.15.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder brief: audit the Solo tier's entitlements, then enforce them, under one
rule — **gate seats, not features.** A Solo manager keeps the whole product
surface (assignment, shows, setlists, DJ packs, UrgAns); what their plan limits
is how many people and how much usage. The audit came first and set the scope;
only two of its findings needed code, and the biggest one was not on the brief's
list at all.

**THE HEADLINE FINDING: Solo could not be sold, so all four of its ceilings were
unreachable dead code.** It shipped 2026-08-30 on the public pricing page at
₦8,000 with an entitlement entry, deliberately staged ("the same staging Manager
itself shipped in") — absent from `SelfServeTierId` and from
`subscriptions_plan_check`, so `resolveTeamTier` could never return it. The tier
was advertised and enforced on nobody. Everything else was secondary to that.

**What the audit found already right, and must not be "fixed" later:**

- **One source of truth, correctly split.** Countable ceilings live in
  `@urganize/pricing` (`PRICING_TIERS[tier].limits`); `ENTITLEMENTS` READS them
  via `limitsOf()`; `tierHighlights()` builds the pricing page's copy from the
  same field. Zero divergent hardcoded values anywhere — verified by enumerating
  every call site, not assumed.
- **No feature is gated by tier, anywhere.** `tasks`, `events`, `setlists`,
  `songs` and the pack routes consult no entitlement, and no `tier === '...'`
  comparison exists outside the entitlements module.
- **External contacts never touch `workspace_members`.** DJ pack recipients,
  curator profiles and credit submitters all have their own tables, so a Solo
  team with its one collaborator can still send tonight's pack. Structural
  rather than enforced by a check that could be forgotten.
- **Every cap fails open** on an unreadable count or an unresolvable tier.
- Both seat doors and both artist doors were already covered.

**The four decisions, all delegated ("do what's best") and all resolved as
KEEP** — every value was already published, so moving one would have reduced an
advertised number or contradicted a settled call: Solo seats **2** (the owner
occupies a seat, so 2 is manager + artist; at 1 the invite form is dead on day
one, the "locked button" the brief exists to avoid), artists **1**, active
releases **1** (survivable only because archiving frees the slot), UrgAns
**40**/month, reset on the **billing anniversary**, and an expired trial still
meets the **full wall** (read-only is for payment failure only — the 2026-08-24
call; a trial expiring into usable limits is a permanent free tier, which the
pricing spec rejects). Manager's artists stay **5**: the brief's table said 2,
but 5 is live on the public page and Manager was out of scope, so the table was
the error.

### Six things worth knowing before editing this

1. **`purchasableTiers()` is the permanent fix for a gap this repo has shipped
   FOUR times** (2026-07-14, -07-15, -08-16, -08-21), each time as a price
   advertised that nothing could charge. Pricing v2 is live in production, so
   simply adding Solo to the wall would have offered a tier whose Paystack Plans
   do not exist and 500'd at checkout. Instead the SERVER says which tiers it can
   charge — self-serve AND both Plan codes configured — and the wall renders
   exactly that, through `/api/subscription-status`, which it already fetched. An
   unmintable tier is not offered, and starts being offered the moment its env
   vars are set with **no code change**. Every previous fix was a reminder to
   mint the Plans first; this makes the order of operations unnecessary. **Do not
   re-derive the offered list client-side** — a browser cannot see whether a Plan
   exists.
2. **`WALL_TIERS` is DERIVED now, and that closed a real defect rather than
   tidying one.** It was a hand-written array and fell out of step the instant
   Solo became purchasable. It filters `PRICING_TIER_ORDER` on `!contactSales`
   rather than importing `isSelfServeTier`, because that predicate lives in
   `lib/billing-plans.ts` — documented server-only Paystack config with no
   business in a client bundle. The two expressions of one fact are held together
   by a test ('the wall and checkout agree on which tiers are self-serve'), not a
   cross-boundary import.
3. **`effectiveTier` is derived, never corrected in an effect.** The offered list
   arrives asynchronously, so a stored selection can briefly name a tier not on
   it. A setState-in-effect would leave one frame where the checked radio is
   absent from its own list — and worse, a frame where Subscribe posts a tier the
   customer never saw. Every read of the chosen tier goes through it;
   `selectedTier` stays the raw record of the click.
4. **THE SEAT WALL NO LONGER DISABLES ITS BUTTONS, and that reversal is the
   point.** They used to dim at `opacity-60` on the reasoning that it "saves a
   round trip that could only be refused" — but the round trip is what CARRIES
   the reason. Disabled, the manager got no message, no named limit and no
   upgrade path, so the server's 409 (which names their plan, its contents and
   the tier that lifts it) was never read by anyone. The flow is fully reachable
   and the block happens at submit, where there is somewhere to put a sentence.
   `teammateError` already rendered the server's string verbatim, so this needed
   no new client copy — which also keeps one implementation of the message.
5. **The invite-LINK mint is seat-capped now, as well as redemption.** Redemption
   stays the real enforcement point (one link, many redeemers, so it is the only
   place a total can be held). The mint check exists so the refusal reaches the
   person who can act on it: without it a team at its ceiling mints a link
   guaranteed to fail, the failure surfaces to whoever clicks it, and the manager
   saw a successful copy-to-clipboard. Placed AFTER the runaway guard, so "revoke
   a link you're not using" — which they can do alone, now — is offered before
   "upgrade your plan".
6. **The webhook's `paid_at` write is no longer fire-and-forget.** It is the
   read-only discriminator (`lapsedFromPayment` reads exactly that field), so a
   subscription row saying `active` with `paid_at` null is a customer who paid us
   and who will be **walled instead of read-only** when a renewal eventually
   fails. The old code logged it and returned 200, telling Paystack the delivery
   succeeded and guaranteeing it would never be retried. Now: one retry, then a
   500 so Paystack redelivers. Both writes are idempotent, and the customer has
   access from the subscription row either way.

### Consistency sweep

The founder asked explicitly for this. Two real problems, one customer-facing:

- **`/for-labels` told Label prospects they get "one artist at a time".** False
  since rosters shipped 2026-08-30, and the worst place in the site to be wrong:
  the tier that pays for a roster, told it gets one artist, while `/pricing`
  offered that same tier "Unlimited artists" one click away. The block still does
  its original job (separating a founder SERVICE from a self-serve FEATURE); only
  the factual half moved.
- **Three comments carried hardcoded ceiling numbers** (`TaskMemberSelect` "4
  seats", `seats-server` "four seats", `urgans-usage` "150 actions"). All now
  point at the field instead of restating it — Solo's numbers differ, so each was
  already half wrong.

### Tests

`lib/tier-limits-guard.test.ts` (45 cases). Per limit: passes at the ceiling,
refuses past it, and the refusal names both the number and the tier that lifts
it. Then the axis that matters most and cannot be tested by driving a UI — this
repo has no component tests and no jsdom, and no database in CI — so **"the
client cannot bypass this" is proved structurally**: every creation point's
source is asserted to CALL its allowance helper (comments stripped first, so
prose cannot satisfy a check). Better than a UI test, which proves one path on
one day; this fails when someone adds a new door. Plus the inverse block, which
is what protects shows and pitching: the DJ pack, curator pitch and credits
routes must call no seat check and touch no `workspace_members`.

**Mutation-tested, five ways, each failing exactly its own test:** dropping the
seat check from the invite-link mint; adding one to the DJ pack route; pointing
the seat counter at another table; making `purchasableTiers` accept one interval
instead of both; and a comment naming a helper satisfying nothing.

**One mutation SURVIVED and is recorded rather than hidden:** deleting the
`isSelfServeTier` guard from `purchasableTiers()` fails no test, because Label
has no entry in `TIER_PLAN_CODE_ENV_VAR` (its mapping moved to
`RETIRED_TIER_PLAN_CODE_ENV_VAR`, which `getTierPaystackPlanCode` does not read)
and Group is absent from `PRICING_TIER_ORDER`. So the env mapping alone excludes
them today and the predicate is defence-in-depth against one specific future edit
— re-adding a sales-led tier to that map, which WOULD be caught. The test says so
and pins both halves separately rather than implying more than it proves.

### Verified

1990 tests passing (45 new), `eslint .` at **byte-identical** counts with and
without these changes (3 errors / 70 warnings, all pre-existing), homepage lint
at its own 0/2 baseline, and `next build` green **by exit code** in both flag
states with `/auth`, `/onboarding` and `/settings` still `○ Static` in each.
Runtime probe confirmed auth still precedes the new seat check (`POST
/api/workspace/invite-link` 401s unauthenticated) and that the external-contact
routes answer their own feature flags rather than a seat refusal.

### NOT verified, and it is the whole risk surface

**Nothing ran against a real database, a real account or real Paystack.** No seat
has actually been refused, no Solo checkout attempted, no webhook delivered, and
neither the wall nor the Teammates section has rendered in a browser — this
sandbox cannot mint a Supabase session and the proxy answers 403 to CONNECT for
both urganize domains. It rests on unit tests, the mutation runs and traced call
paths.

**The Part 1 audit could not deliver production counts** for the same reason
(`.env.local` points at `placeholder.supabase.co`). The SQL is in the audit
report; the structural half was answerable from code and is the stronger answer
anyway: **no existing account can be broken by the Solo caps**, because five
branches resolve to the uncapped tier before a plan is read (founding, trial,
grace, comped, walled/read-only), every pre-tier plan id maps to `label`, and an
unknown plan maps to `label`.

### Activation checklist

1. ~~Apply `20260901100000_subscriptions_allow_solo.sql`~~ — **done 2026-09-01.**
   It widens `subscriptions_plan_check` AND `subscriptions_pending_plan_check`
   (the second is for the DOWNGRADE direction — Manager → Solo parks the target
   in `pending_plan`, so widening only the first would let a Solo purchase
   through and refuse a Solo downgrade). It ends in a `do $$` block that raises
   if either constraint did not take, so a clean run is the proof.
2. ~~Mint two Paystack Plans and set `PAYSTACK_PLAN_SOLO_MONTHLY_NGN` /
   `PAYSTACK_PLAN_SOLO_ANNUAL_NGN`~~ — **done 2026-09-01, BEFORE the code
   shipped.** ₦8,000/mo → `PLN_pugb0hjd5klpkfe`, ₦80,000/yr →
   `PLN_x0bmsd3dk8x1e0p`. **This is the first time in this repo's history the
   mint-before-flip order was followed on the first attempt** rather than
   corrected after a customer or a founder noticed — four previous passes shipped
   the gap. Worth knowing for anyone auditing the dashboard: the two Plan objects
   are named `monthly` and `yearly` there, not `PAYSTACK_PLAN_SOLO_*` like
   Manager's, so the AMOUNT is what identifies them; the ₦8,000 one also carried
   one pre-existing subscriber, which is unaffected (their stored
   `subscriptions.plan` is whatever it already was, not `solo`).
3. Do NOT repoint `PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN` — Label's live
   subscriptions still renew against those.
4. ~~Changelog entry + version bump~~ — done as v1.15.0. Landed at merge rather
   than at flag-flip because pricing v2 is already on and the seat-wall message
   is live immediately.
5. **OPEN, and it is the only thing left: MERGE AND DEPLOY.** Steps 1 and 2 are
   database and configuration; `purchasableTiers()`, the widened
   `SelfServeTierId`, the derived `WALL_TIERS` and the seat-wall change all live
   in code, so until this branch is on `main` nothing has changed for a user —
   the env vars are set and read by nothing. Note the migration and the env vars
   being live FIRST is harmless and is the designed order: a database that
   permits `solo` and Plans nobody references cost nothing.
6. Then verify with a real card: buy Solo monthly, confirm Paystack quotes
   ₦8,000 and `subscriptions.billing_interval` reads `monthly`, then invite a
   second teammate and confirm the refusal appears **in the Settings error box**
   rather than as a dimmed button.

**Also worth one check while in the Paystack dashboard:**
`PAYSTACK_PLAN_MANAGER_ANNUAL_NGN` (₦350,000) could not be confirmed from the
plans list — only the monthly one was visible. Manager needs BOTH intervals
configured before `purchasableTiers()` will offer it, by the same rule Solo
follows, so if that Plan or its env var is missing then Manager is currently
being withheld from the wall too.

### A sales-led plan could still reach checkout (2026-09-01, same day, no version)

Found by the founder asking a plain question — "what is the Label plan, it's
currently 750k" — which is worth recording as much as the fix.

**`resolveCheckoutPurchase` guarded only `plan === 'enterprise'`.** Label went
sales-led on 2026-08-30, and it is a valid id in BOTH pricing generations: the
tier branch correctly declines it (`isSelfServeTier` says no), and it then fell
through to the LEGACY branch, where `isBillingPlanId` still accepts 'label'. So
a request for it resolved `PAYSTACK_PLAN_LABEL_NGN` — a stale ₦750,000 Plan that
really does exist in the dashboard — while recording `BILLING_PLANS.label`'s
₦800,000. Two different figures, on a tier that is meant to be a conversation.

Unreachable from any UI (the wall filters on `contactSales`, `/locked`
early-returns on it), so this is the decision being enforced at the layer that
makes it rather than only in the two surfaces that happen to respect it. Derived
from `contactSales`, so making a tier sales-led closes its checkout in the same
edit.

**THE PART WORTH REMEMBERING: a test already claimed to cover this and passed for
the wrong reason.** `refuses to sell Label, which went sales-led` called
`stubLive()`, which does not stub `PAYSTACK_PLAN_LABEL_NGN` — so the refusal was
really "plan code not configured" (a 500) out of the legacy branch, not the
sales-led decision. Setting that one env var in production would have removed the
only thing refusing it, and the test would have gone on passing. It now stubs a
valid Label plan code so the ONLY thing that can refuse is the guard, and asserts
**400** specifically, because a 500 there is the accidental pass returning. Same
failure shape as the surviving mutation recorded above: green is not the same as
covered.

Also: the guard's first draft checked BOTH generations, and a mutation test
showed the second lookup was unreachable — every sales-led id is a
`PricingTierId`. It was deleted rather than kept as decoration, and
`salesLedIdsAreAllTierIds` pins the assumption so a legacy-only id becoming
sales-led fails loudly instead of slipping through.

**No changelog entry and no version bump**, per the internal-only rule: no UI
could reach this path, so nothing a user can observe has changed. The
2026-08-27 metadata-route gating was handled the same way.

**Label, for the record, has no price in the product.** `PRICING_TIERS.label`
carries no `prices` at all; the ₦800,000 in `BILLING_PLANS.label` is legacy,
displayed nowhere, and kept only for an existing subscriber's renewal math. The
two ₦750,000 Plans in the dashboard (`PAYSTACK_PLAN_LABEL_NGN` and
`PAYSTACK_PLAN_LABEL_USD`, the latter charging NGN despite its name) are read by
nothing. A live Label subscription renews against
`PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN`, which is why those must not be repointed.
