# The team trial shortened to 3 days (2026-09-10)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder call: shorten the free trial from 14 days to 3. Not a scope
expansion, no migration, no new flag — the mechanism (`NEXT_PUBLIC_FEATURE_HARD_PAYWALL`,
see "Team trial + hard paywall" above) is untouched; only the length changes.

**`TEAM_TRIAL_DAYS` in `lib/team-billing.ts` is the ONE place this is a
number** — `ensureOwnedWorkspace`'s provisioning stamp, the founder-alert
"trial started" event, and every UI surface (`TeamTrialStrip`, `/admin/teams`,
`/locked`) all read it or a value derived from it, and none of them carry a
second hardcoded day count. That single-source property is what made this a
constant edit rather than a hunt.

**Two things needed more than the constant, both because they were sized
against the OLD 14-day length rather than against the trial itself:**

1. **`TEAM_TRIAL_PILL_THRESHOLD_DAYS`** — the countdown strip's "show only
   near the end" rule — was `10`, i.e. the last 10 of 14 days (~71% of the
   trial). At `10` against a 3-day trial the pill would show for the ENTIRE
   trial from day one, which is exactly the "nagging countdown" the constant's
   own comment says it exists to avoid. It is `1` now: the strip appears only
   on the trial's final day. The invariant test
   (`TEAM_TRIAL_PILL_THRESHOLD_DAYS < TEAM_TRIAL_DAYS`) still holds and would
   have caught getting this wrong in the other direction.
2. **The founder-alert "trial ending soon" sweep
   (`runTrialEndingSweep` in `lib/billing-alerts-server.ts`) had ITS OWN
   hardcoded `3 * DAY_MS` horizon**, sized as "the last 3 of 14 days" and
   coincidentally the same digit as the new trial length — a trap for anyone
   skimming rather than reading the comment. Left as a literal `3`, every team
   would trip the "entering its last 3 days" alert on the day it is CREATED,
   since `now + 3 days` always lands on-or-past a 3-day trial's `trial_ends_at`
   from day one. It now imports `TEAM_TRIAL_PILL_THRESHOLD_DAYS` from
   `team-billing.ts` and derives the horizon from that shared constant instead
   of a second hardcoded number — the same "one source of truth" property the
   rest of the file already had, extended to close the one place it was
   missing. This was a real behavioural bug caught by tracing the sweep before
   shipping, not by a test — it has no test file, per this codebase's own
   documented pattern of manual-pass-only coverage for I/O-heavy server
   sweeps.

**The marketing site cannot import `TEAM_TRIAL_DAYS`** (the established
`apps/homepage` cannot import `apps/web` constraint, the same one that forces
`lib/positioning.ts` to be duplicated byte-for-byte across both apps), so
"14 days" / "14-day" is duplicated as literal prose across the homepage:
the hero, the final CTA, `/features`, all three self-serve persona pages,
`/signup`, `/terms` §04, the pricing strip, the tier-card footnote, and the
FAQ. All of it now reads "3 days" / "3-day". `PricingTierCards.tsx`'s own
comment already named the three places that have to move together (the
constant, its own copy, and `/signup`) — this is that move, done for real
with the trial length as the second thing (after the annual-only reprice)
to actually require it.

`docs/store-listing.md` (the paste-ready, never-yet-submitted App Store /
Play Store copy) is not history — it is a draft awaiting the founder's first
store submission — so it moved too, along with its stated character count
for the block that changed (`1,777` → `1,776`, one character shorter for
"3 days" versus "14 days"). By contrast, `packages/changelog/src/index.ts`'s
own v0.60.0 entry announcing the ORIGINAL 14-day trial is left exactly as
written — changelog history is never rewritten, the same rule that keeps the
v0.9.0 trial entry and the pre-tier pricing entries untouched through every
later change.

**Verified:** `pnpm test` (3190 tests, same count as before — the constant
and its test file's three assertions were rewritten together, so nothing
about test coverage shrank), `eslint .` at the exact 3-error / 78-warning
baseline, `tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors, and `next build` green **by exit code**
for both apps with `/auth`, `/onboarding`, `/settings`, `/dashboard`,
`/pricing`, `/signup` and `/terms` all still `○ Static`. The prerendered HTML
was read directly rather than trusted from source (this repo's habit for any
copy change): every marketing page checked shows "3 days" / "3-day" and zero
occurrences of "14-day" or "14 days free" survive anywhere in the built
output.

**Not verified:** nothing has run against a real database, so no team has
actually been provisioned with a 3-day `trial_ends_at`, the shortened pill
window has never rendered against a real countdown, and the corrected
founder-alert sweep has never fired for real. Worth one live pass once
deployed: create a team, confirm `workspaces.trial_ends_at` is ~3 days out,
watch the strip stay silent until the final day, and confirm the sweep does
not fire the "trial ending soon" alert on day one.
