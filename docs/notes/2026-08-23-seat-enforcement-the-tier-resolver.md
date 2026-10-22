# Seat enforcement + the tier resolver (2026-08-23)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The first cap the entitlement map actually enforces, plus the resolver every
other cap will need. **Not flag-gated, because it does not need to be** — see
the inertness argument below, which is a stronger guarantee than a flag and is
pinned by a test.

**The tier resolver is the piece to understand first.** `getTeamAccessForUser`
already fetched the owner's subscription snapshot to decide `hasAccess` and threw
its `plan` away; `resolveTeamTier` (`lib/entitlements.ts`) maps that plan onto a
tier, and `TeamAccessSnapshot` now carries it.

1. **It FAILS OPEN, everywhere, and inverting that would cap real teams by
   accident.** An unknown plan, an absent plan, every legacy plan id, a trial, a
   grace window, a comped team and a grandfathered `founding` deal all resolve to
   `label`, which is uncapped. So does a walled team, and so does the fail-open
   snapshot. Never change "unknown means uncapped" to "unknown means entry tier".
2. **`getWorkspaceTier(workspaceId)` exists alongside it because the
   user-scoped answer is wrong at one enforcement point.** When somebody redeems
   a shareable invite link the acting user is the INVITEE, whose own primary team
   is not the team being joined — usually their own empty shell, which is on a
   trial and therefore uncapped. Resolving from the workspace's OWNER is the only
   correct read there.

**Seats are capped at BOTH creation points, and that is the whole point.**
`POST /api/workspace/members/invite` mints one seat per email;
`POST /api/invites/[token]` redeems a link MANY people can use. Capping only the
first leaves the ceiling trivially bypassable. Two placement details that took
reading the code to get right:

- In the email route the check sits **inside the new-row `else` branch**, not
  before it. Anywhere earlier also blocks a RE-invite of somebody who already
  holds a seat, which changes no total and must always be allowed.
- In the link route it sits in `joinWorkspaceViaLink` **after** the
  already-a-member early return, which covers both link kinds in one edit.

**`lib/seats-server.ts` is a leaf module on purpose.** The invites route
deliberately hand-rolls its auth and re-declares its own table constant to stay
off the `@/app/api/_shared/auth` chain, because that chain runs
`requireActiveAccount` and an invitee joining a paid team has no subscription of
their own. Importing anything paywall-adjacent into that route would lock out
every new teammate. Keep this module's imports leaf-only.

**Fail-open again, at the count.** `countTeamSeats` returns null on any read
failure and every caller treats null as "do not enforce": turning a transient
database blip into a team that cannot grow is a far worse failure than briefly
allowing one seat too many. Unit-tested, including the throw path.

**LIVE since 2026-08-24, and the tripwire below did NOT fire.** Pricing v2 went
on in production, so a team that buys Manager is genuinely capped at four seats,
three active releases and 150 assistant actions. The guard written to announce
that moment watched `BILLING_PLAN_ORDER` and `ADMIN_ASSIGNABLE_PLANS`, and
`manager` never entered either — it became purchasable through a THIRD path,
`resolveCheckoutPurchase`'s `pricingV2 && isSelfServeTier(plan)` branch. **A test
pointed at constant arrays cannot see a new branch.** It is now pointed at the
checkout decision itself and mutation-tested. Two docstrings that still claimed
inertness (`lib/seats-server.ts`, `lib/release-cap-server.ts`) were corrected at
the same time. The flip capped no existing customer: every pre-tier plan id, plus
trials, comps and `founding` deals, resolves to the uncapped tier, which is now
asserted rather than reasoned about. The original argument follows.

**Why no feature flag: enforcement WAS inert, structurally.** Nothing in
the product can write `subscriptions.plan = 'manager'` — checkout validates
against the legacy plan ids and `ADMIN_ASSIGNABLE_PLANS` does not include it — so
every team resolves to `label` and no ceiling exists to hit.
`entitlements.test.ts` asserts that for **every plan value any code path can
currently write**, so if someone later makes `manager` writable, that test
failing is the reminder that caps just went live for real teams. A second flag
here would add a way for that to be wrong without adding any safety.

**Instrumentation:** a `limit_hit` billing event carrying the entitlement key,
the limit and the count. `billing_events.type` is free text by design, so this
needed **no migration**. These rows are the pricing spec's "track every limit
hit, by entitlement key" and are the clearest buy signal the product produces.

**Settings shows the ceiling before you meet it:** `GET /api/workspace/members`
now returns `seatLimit`, and Teammates renders "3 of 4" plus disables Invite and
Copy-link at the cap. `null` means no ceiling OR an unreadable tier, and renders
nothing either way — the honest fallback. It is deliberately **not** cached
alongside the member list: a ceiling changes when a plan changes, and a stale one
would tell a manager who just upgraded that they are still capped. The disabled
buttons are a courtesy, not a gate; the server still enforces.

**The refusal needs no client work.** Both routes return a flat
`{ error }` at **409**, and both surfaces already render that string verbatim —
Settings in its inline error, and the invite-accept page in its banner. The
invitee's copy adds "Ask the person who invited you to upgrade", since they
cannot fix it themselves.

**The other two countable caps were deferred here and built in the same PR** —
`active_releases` and `urgans_monthly_actions`, each of which needed a
prerequisite this commit did not have (an archive action, and something to count
with). See the section immediately below.

**`rollout_template_custom_save` stays declarative**, and that is not a deferral
to revisit: templates are static TypeScript and `release_plan_drafts` is unique
per release, so there is nothing to save and nothing to gate. Gating it would
gate a feature that does not exist.

**Verified:** 1050 tests (34 new), `eslint .` at the exact 3-error/65-warning
baseline, `next build` green by exit code with pricing v2 both off and on under
production config, `/auth` and `/settings` still `○ Static`. **Not verified:**
nothing has run against a real database, so no seat has actually been refused —
the caps rest on unit tests plus the traced call paths. Worth exercising once
`manager` is a real plan.
