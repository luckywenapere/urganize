# Pricing tiers + the entitlement map (2026-08-23, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder spec: replace the single team price with three tiers, and introduce the
first **per-plan entitlement map** this product has ever had. Everything before
this was binary — `requireActiveAccount` answered yes or no, and feature
availability was a global `NEXT_PUBLIC_FEATURE_*` env flag identical for every
paying team. Behind `NEXT_PUBLIC_FEATURE_PRICING_V2` (default off). **PR 1 of
several: schema and config only, nothing enforced, nothing displayed.**

Tiers: **Manager** ₦35,000/₦350,000, **Label** ₦80,000/₦800,000 (`recommended`,
the tier we sell), **Enterprise** sales-led with no price.

**Renamed 2026-08-24 (founder call): the sales-led tier is called "Group", not
"Enterprise".** Two reasons, both about this niche: "Enterprise" is B2B software
jargon that means nothing to a label head and breaks the marketing voice rules
(fifth-grade readable, no jargon), and "Group" is what its own audience line
already says — distributors and groups operating several labels, neither of
which is "a label". The founder's first instinct was a two-step shuffle
(Enterprise→Label, Label→Team); the second half was argued down and dropped,
because it would have moved the word "Label" off the priced, self-serve,
recommended tier and put the ICP behind a sales conversation, and because
nobody self-identifies as "a team". The ladder is **Manager → Label → Group**.

**The DISPLAY NAME changed; the `enterprise` ID did NOT, and must not.** That id
is written into `subscriptions.plan` and allowed by `subscriptions_plan_check`
(`20260823100000_pricing_tiers.sql`), so renaming it needs a migration plus a
backfill and would silently re-grade stored rows — and the `label` id already
carries two historical meanings, so a third collision is exactly what to avoid.
`entitlements.test.ts` pins the split (id `enterprise`, label `Group`, and no
tier displaying the old word), mutation-tested rather than merely asserted. No
changelog entry or version bump: in `apps/web` every surface carrying this copy
is behind `NEXT_PUBLIC_FEATURE_PRICING_V2`, which is off, so the only live
surface is the public `/pricing` page — an `apps/homepage` change, which the
app-only scope rule excludes. Both priced tiers hold
the 10× "2 months free" ratio the ladder has always used.

**Five things worth knowing before touching this:**

1. **It is ADDITIVE, not a rename, and that was forced by timing.** The hard
   paywall went live the day before (v0.60.0) and `/locked` + `TeamWall` call
   `getPlan()` from `packages/pricing` at render time, so editing `BILLING_PLANS`
   would change what a real checkout advertises. `BILLING_PLANS`, `BillingPlanId`
   and every existing export are untouched; `PRICING_TIERS` sits beside them. A
   test pins the live amounts at ₦80,000/₦800,000 so this PR cannot have moved
   them.
2. **Label's prices are deliberately identical to the live monthly/annual
   amounts, and that is the whole migration story.** `monthly → label@monthly`
   and `annual → label@annual`, same figures against the **same Paystack Plan
   objects**, so no existing or in-flight subscriber changes price and **only
   Manager needs new Plans minted**. A test pins Label's amounts to
   `BILLING_PLANS`' so the two cannot drift while they share Plan objects.
   Today's `label` (contactSales, and *unreachable* — absent from
   `subscriptions_plan_check` and `PAYSTACK_PLAN_LABEL_*` unset, so checkout 500s
   before the CHECK could reject it) maps onto `enterprise`: same offer, clearer
   name, no data to migrate.
3. **`data_export` is true on every tier and a test enforces it structurally.**
   It is a trust feature, not a revenue feature: a buyer who cannot get their
   catalogue back out has been trapped rather than sold to. The spec says "do not
   gate it later", and a comment cannot enforce "later" — `entitlements.test.ts`
   can. If a future change needs it gated, that test failing IS the conversation.
   **The feature itself does not exist yet** (no export route, no Settings
   control; the fan-capture "Copy as CSV" is a clipboard write), so declaring it
   here is a commitment: do not advertise it on a public page until it is built.
4. **Never compare a plan name inside a feature check.** Always resolve through
   `resolveEntitlements` / `getEntitlement`. That is what lets a tier be re-cut
   without a deploy, and why there are no exported per-tier constants. Writing
   `tier === 'manager'` in a route means the map is missing a key.
5. **`UNLIMITED` is `null`, not `Infinity` or a large integer.** It survives
   JSON, cannot be accidentally compared with `<`, and forces callers through
   `isWithinLimit`. `remainingAllowance` never returns a negative, because the
   spec's downgrade rule is "block new invites, deactivate nobody" — a team that
   dropped below its seat count reads 0, not −6.

**Three entitlements are DECLARATIVE ONLY — reading them today gates nothing:**
- `rollout_template_custom_save` — templates are static TypeScript in
  `lib/release-templates`, and `release_plan_drafts` is unique per release, so
  there is nowhere to save a reusable one. Gating this would gate a feature that
  does not exist.
- `urgans_monthly_actions` — nothing counts assistant calls. No counter table, no
  server-side event, not even a PostHog event per invocation. The counter and its
  billing-anniversary reset are a new build including storage.
- `active_releases` — **not enforceable, and the reason is load-bearing.** Nothing
  ever writes `releases.status = 'released'` or `'archived'`, no UI exposes a
  status picker, and `GET /api/releases/[id]` **overwrites** stored status with a
  computed value that can only be `draft | in_progress | ready`. So a cap keyed on
  that column is a cap on releases-ever-created with no way to free a slot — the
  opposite of the spec's "archiving or completing frees a slot immediately".
  `lib/recap-eligibility.ts` already answers "is this finished" honestly (date
  passed OR all tasks done) and is the definition to reuse, but an explicit
  archive action is a prerequisite.

`sso` and `sub_teams` are declared false outside Enterprise and read by nothing —
deliberate, and consistent with principle 6: the map records the offer, it does
not authorise the build.

**Migration `20260823100000_pricing_tiers.sql`** widens `subscriptions_plan_check`
for the three tier ids (purely additive — a value this constraint stops
permitting makes `isRecurringPlan` stop recognising it and the webhook
**silently stops extending** that subscription) and adds
`workspaces.legacy_rate_expires_at`. **No new `legacy_founding` column:**
`billing_plan = 'founding'` already means lifetime price lock and is already
independent of `subscriptions.plan` as the spec asks, and
`billing_locked_amount` is already the rate — what was missing was an end date,
since "lifetime" is the one thing a 12-month legacy rate is not. The migration
also extends `prevent_workspace_billing_self_update` to the new column; leaving
it out would let an owner extend their own legacy rate from the browser, because
"Owners manage workspaces" is `FOR ALL`.

**Two more spec items flagged rather than built:** a seat cap needs **two**
enforcement points, not one — the invite-link path mints one code many people
redeem, so `members/invite/route.ts` alone is bypassable and
`invites/[token]/route.ts` needs it too. And a 4-seat Manager cap makes
`packages/pricing`'s own "Team-priced, not per-seat" comment false; move that
comment with the decision.

**Not in this PR:** enforcement, data export, the public pricing page, read-only
on payment failure (founder call: payment failure only, trial expiry keeps the
wall), plan changes and proration, grandfathering execution, and the
workspace-starts-empty copy pass. Suggested order is export → enforcement →
pricing page → read-only → plan changes, because export unblocks the page and the
page is the revenue surface.

**Verified:** 982 tests (26 new), `eslint .` at the exact 3-error/65-warning
baseline, and `next build` green **by exit code** for both apps with `apps/web`
built in both flag states under production config
(`NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true`), `/auth`, `/onboarding`, `/settings`
still `○ Static` in each. **The inertness proof is the useful part:** the live
prices bundle as `8e4`/`8e5` (minifiers rewrite `80_000` exponentially, so
grepping for "80,000" measures nothing — the comma comes from `Intl` at runtime),
while Manager's `35e3`/`35e4` and every new symbol (`PRICING_TIERS`, each
entitlement key, the tier copy) appear in **zero** browser chunks. Nothing
imports them yet, so they are tree-shaken out entirely — stronger than the flag
hiding them. In the homepage build the tier data reaches server source maps only,
never a browser chunk.

**Activation checklist** — corrected twice, and now current. It first implied
minting Paystack Plans was the only step, which was wrong: two pre-existing
checkout/renewal bugs blocked the flag. **Both are FIXED as of 2026-08-24** —
see "Tier checkout and renewal" below. What remains:

1. Apply `20260823100000_pricing_tiers.sql` and
   `20260824100000_subscriptions_billing_interval.sql`. The second is not
   optional: without `subscriptions.billing_interval` a tier subscription cannot
   record whether it bills monthly or annually, and every renewal extends by the
   wrong period.
2. **Mint two Paystack Plans — Manager monthly ₦35,000 and Manager annual
   ₦350,000 — and set `PAYSTACK_PLAN_MANAGER_MONTHLY_NGN` /
   `PAYSTACK_PLAN_MANAGER_ANNUAL_NGN`.** Both vars are now read (they were read
   by nothing until 2026-08-24). Label reuses the Plans minted 2026-08-22
   unchanged, so **do not repoint** `PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN`. Manager
   is the only tier that can reproduce the advertise-vs-charge gap (five
   occurrences and counting) — and until its two vars are set, a Manager checkout
   returns a 500 rather than charging the wrong Plan, which is the correct
   failure.
3. The pricing-page PR, which is what actually makes a tier buyable: `/locked`
   still posts the legacy `monthly`/`annual` ids, and those keep working under
   the flag by design. Enforcement, export and checkout/renewal are done, so the
   flag alone still changes nothing a user sees.
4. Changelog entry + version bump at flip, not at merge (the EPK precedent).
