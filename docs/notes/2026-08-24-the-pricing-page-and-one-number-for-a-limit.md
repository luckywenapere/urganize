# The pricing page, and one number for a limit (2026-08-24)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The surface that makes a tier buyable, and the last piece before
`NEXT_PUBLIC_FEATURE_PRICING_V2` is worth flipping. Two surfaces changed: the
public `/pricing` page and the in-app wall.

### It reverses a founder decision — gated at first, then unconditional

`/pricing` had been in **BOOK-A-DEMO MODE since 2026-07-23** — the price table
was deliberately removed because the founders want to talk to every team before
money changes hands. The pricing spec (2026-08-23) asks for a public
three-column page, which is the opposite call, newer.

So the table shipped **flag-gated rather than swapped in**, on the reasoning that
a reversal of a founder decision should be revertible from a dashboard. **That
gate was removed the next day (2026-08-24, founder call), and the page now
renders the table unconditionally.** Read the header of
`apps/homepage/app/pricing/PricingPageClient.tsx` before reinstating it.

**Why it came out, because the failure is the reusable part:** the flag is read
at module scope, so Next inlines it at BUILD time. Flipping it therefore needed
three things to line up at once — the var set on the right one of TWO Vercel
projects, a commit touching `apps/homepage`, and a deploy `turbo-ignore` did not
skip. Twice it did not, and the live page kept serving a bundle with `false`
compiled in while the env var said otherwise. The second attempt was a version
bump specifically chosen to force the rebuild (turbo-ignore was verified to
answer "This commit affects @urganize/homepage"), and the page still did not
change — which is what exhausted the code-side explanations and left only
config we cannot see from the repo.

What made removing the gate the right trade rather than a shortcut: **this page
has no risk surface.** Every CTA is a mailto and nothing on it links to
`app.urganize.app`, so the lever was never protecting money — it was protecting
a headline, and editing one file reverts it either way.

**The flag is still live in `apps/web`**, gating tier checkout, the picker on
`/locked`, plan changes and the entitlement resolver. So the two surfaces CAN now
legitimately disagree, and the safe direction is the one they disagree in: the
public page may advertise a tier the app cannot yet sell (the visitor books a
demo and reaches a human), where the reverse — an app selling what the site never
mentioned — would be the surprise.

**Three CLAUDE.md claims about this page were stale** when the table shipped and
were corrected then: it had no tier cards, no FAQ, and nothing anchored to its own
`#waitlist` — its primary CTA was a `mailto:` book-a-demo, with the waitlist as a
secondary section.

**Every CTA is still a capture** (founder call), and that was true in both modes
while there were two. The cards book a demo and the sales-led card emails us. Nothing on the page links to
`app.urganize.app`, because that would reopen the self-serve funnel closed in
URG-125/URG-136. What price-table mode restores is **not** the pre-July layout in
git history: that one sold legacy plans in two currencies, and the tier model is
NGN-only.

### The structural change: one number for a limit

`apps/homepage` depends on `@urganize/pricing` and **cannot import from
`apps/web`**. So a marketing page quoting "4 people" would have had to carry its
own copy of a figure the enforcement layer also holds — the display-vs-reality
gap this repo has shipped four times with prices, waiting to happen with limits.

The countable ceilings therefore moved into the package as
`PricingTierDefinition.limits`, and `ENTITLEMENTS` in `apps/web` now **reads
them** instead of declaring them. `tierHighlights()` builds each ceiling line
from that same field, so the page renders the number the route enforces, by
construction. Three tests pin it, and the derivation was **mutation-tested**:
re-literalising one ceiling fails them.

Two things deliberately did NOT move:
- **The boolean entitlements** (`data_export`, `concierge_onboarding`,
  `support_channel`, `sso`, `sub_teams`) stay in `apps/web`. They gate behaviour
  rather than being numbers a page quotes.
- **The resolution logic** (`resolveTeamTier`, `checkLimit`, `getEntitlement`)
  stays in `apps/web` for the reason its own header gives: `vitest.config.ts`
  collects `lib/**/*.test.ts`, and that is decision logic which has to be tested.
  The data moved; the decisions did not.

`TIER_LABEL` in `entitlements.ts` was a third hand-written copy of the tier names
and now reads `PRICING_TIERS[tier].label`.

### Enterprise advertises only what is built

`sso` and `sub_teams` are declared in the entitlement map and **read by
nothing**. A contract can promise them; a public page cannot. Enterprise's
`perks` therefore name neither (founder call), and a test asserts the rendered
copy contains no such claim — the `data_export` discipline applied to a
marketing claim, because "a reviewer will notice" is not a mechanism. Verified
against the built HTML too: zero occurrences in visible text.

### Four things worth knowing before editing either surface

1. **The wall offers two tiers, not three.** Enterprise is absent from
   `WALL_TIERS` because `TeamWall` already carries a full-weight "Talk to us"
   card beside the picker, and a third radio that cannot check out would be a
   dead end next to the real path. Exactly the reasoning that kept the legacy
   `contactSales` plan out of `PLAN_ORDER`.
2. **`intent=upgrade` was worse than a dead param, and now works.**
   `UrgansUsageStrip` has linked to `/locked?intent=upgrade` since the caps
   shipped and nothing read it — so a team that hit a ceiling still had access,
   and the wall's has-access effect bounced them straight back to the app. A
   no-op round trip. The wall now treats it as a deliberate arrival, with its own
   headline and a "Change your plan" CTA.
3. **The interval control comes before the tier cards, on both surfaces.** It
   reprices every card below it, so asking for it afterwards would move the
   numbers under the user's cursor.
4. **The legacy `/locked` picker (`LegacyLockedPage`) was deliberately left
   alone.** `NEXT_PUBLIC_FEATURE_HARD_PAYWALL` is on in production, so `TeamWall`
   is what every real user sees; the legacy page is the documented flag-off
   revert path, and the legacy plan ids it posts are still accepted by checkout.
   Updating it would have doubled the picker work to change a page nobody
   reaches. Same for `/start-trial`, whose funnel is superseded and flag-off.

`TierPlanPicker` uses a real `<input type="radio">` inside a `<label>` (the
`PlannerRadioGroup` approach) rather than the `<button role="radio">` the billing
pickers have used until now — arrow-key groups, screen readers and the 44px hit
target come free, along with the focus ring the hand-rolled version was missing.

### Also fixed in passing

`layout.tsx`'s `softwareApplicationSchema` declared `"priceCurrency": "USD"`.
Every price Urganize charges is in Naira, and USD checkout has never worked. It
said USD from the day it was written.

### Verified

**1118 tests** (8 new), `eslint .` at the exact **3-error / 66-warning** baseline
in `apps/web` and **0 errors / 2 warnings** in `apps/homepage` — both unchanged.
`next build` green **by exit code** for BOTH apps in BOTH flag states, with
`/auth`, `/onboarding`, `/settings` still `○ Static` and `/pricing` still
`○ Static` in each. The flag-on `/pricing` HTML was read directly rather than
assumed: the new headline present and the old one gone, ₦350,000 and ₦800,000
rendering, "2 months free", "Most teams", and the derived ceiling lines ("4
people on your team", "3 releases at a time", "150 UrgAns actions a month")
alongside "Unlimited" on the two uncapped tiers.

**Not verified:** the in-app picker has never rendered in a browser — the wall
needs an authenticated, walled session this environment cannot mint — so the
interval toggle, the tier radios and a real tier checkout are reasoned from code
plus unit tests. Nothing has run against real Paystack. Worth one pass once
Manager's Plans exist: open the wall, switch to Monthly, pick Manager, and
confirm Paystack quotes ₦35,000.

### Activated 2026-08-24 (founder) — what this checklist required

**`NEXT_PUBLIC_FEATURE_PRICING_V2=true` is live on the `Web` project.** The
founder confirmed both migrations applied, Manager's two Paystack Plans minted
and `PAYSTACK_PLAN_MANAGER_{MONTHLY,ANNUAL}_NGN` set, with
`PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN` left pointing at the Plans Label reuses.
The ledger entry landed as **v1.1.0** — announcing the in-app plan picker,
which is the half a user actually notices (the public table has been live and
unconditional since 2026-08-24 and, being `apps/homepage`, never earns an
entry).

**One deploy-order detail worth keeping.** `NEXT_PUBLIC_*` is inlined at build
time, so setting the variable does nothing until a deploy rebuilds `apps/web`.
The commit that did that here was the unrelated Enterprise→Group rename, not a
deliberate flip — so the flag may have sat set-but-inert for a stretch. On any
future flag flip, run `npx turbo-ignore @urganize/web --fallback=<the commit
Vercel last deployed for that project>` and confirm it answers "This commit
affects @urganize/web" before believing the flip took.

**NOT verified, and it is the whole risk surface:** nothing here has been
exercised against live traffic or real Paystack. No tier checkout has been
charged, no proration taken, no cap has refused anyone, and no team has gone
read-only. This sandbox cannot reach `app.urganize.app` — the agent proxy
answers 403 to CONNECT for both urganize domains — so every claim rests on unit
tests and both-flag-state builds. Worth one real pass: buy Manager monthly and
confirm Paystack quotes ₦35,000, then check the seat cap refuses a fifth invite.

### The original checklist (kept for the record)

1. Apply `20260823100000_pricing_tiers.sql` and
   `20260824100000_subscriptions_billing_interval.sql`.
2. Mint Manager's two Paystack Plans (₦35,000 / ₦350,000) and set
   `PAYSTACK_PLAN_MANAGER_{MONTHLY,ANNUAL}_NGN`. **Do not repoint**
   `PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN` — Label reuses them.
3. Set `NEXT_PUBLIC_FEATURE_PRICING_V2=true` on the **`Web`** project only. This
   said "both projects" until 2026-08-24, when the marketing site stopped reading
   the flag entirely (see the section heading above) — the public table is
   unconditional now, so the site needs no env var and setting one there does
   nothing.
4. Changelog entry + version bump at the flip, not at merge (the EPK precedent).
   `apps/homepage` changes never earn one, but the `apps/web` half does.
