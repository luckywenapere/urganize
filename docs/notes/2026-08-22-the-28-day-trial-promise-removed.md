# The 28-day trial promise, removed (2026-08-22)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The copy pass the section above flagged. Five surfaces promised the old
28-day per-account trial or open-ended free access, **none of them reading a
feature flag**, so all five would have gone wrong the moment
`NEXT_PUBLIC_FEATURE_HARD_PAYWALL` flipped. `/terms` was already wrong:
nothing has granted a trial on signup since the paywall was switched off on
2026-07-23.

Everything here describes the intended post-flip state. Today's access is
broader than any of it claims, so it **under-promises rather than
over-promises** and needs no second pass at flip time.

**`/terms` §04 got three substantive edits, not just the number** (and
`LAST_UPDATED` moved to August 22, per the discipline comment above it):
1. 28 becomes 14.
2. It now says the trial covers the **whole team, not each person, so joining
   an existing team does not start a new one**. That is exactly what
   `combineTeamAccess` enforces, and a teammate reading the contract should be
   able to find it there.
3. **"in NGN or USD" is dropped.** USD checkout has never worked: there are no
   `PAYSTACK_PLAN_*_USD` env vars and the Paystack account only offers NGN in
   plan creation. A contract must not promise a currency we cannot bill in.
   ¶2 only covered a lapse, so it now names trial expiry (the main way access
   stops under this system) and states plainly that nothing is deleted.

**The three persona pages** (`for-executives`, `for-managers`,
`for-ai-artists`) said "Urganize is free to use right now". Left alone, fixing
`/signup` alone would have produced a site contradicting itself on three
indexed pages.

**Three things deliberately NOT changed, each for a different reason:**
- **`packages/changelog`'s 28-day entry (v0.9.0) is history.** Rewriting a
  ledger entry would falsify the log, and line 993's "Urganize is now free to
  use" is the same kind of superseded history sitting right beside it. The
  flag-flip entry is what resolves this, which is how a changelog works. It is
  the only place "28-day" survives in built output, verified.
- **`/locked`'s "Start 28-day free trial" (line 408).** Accurate on the only
  path where it renders: with the flag off `POST /api/trial/start` really does
  grant 28 days, and with the flag on `LockedPageClient` early-returns
  `<TeamWall />` so the button is unreachable. Changing it to 14 would make it
  a lie in the one state that shows it.
- **`/for-curators`' four "free for curators" claims.** Structurally true:
  curator routes use `requireCuratorUser` and never reach
  `requireActiveAccount`.

**One live defect found and fixed while sweeping** (`lib/billing-summary.ts`):
`TeamAccessState` has five members and the team branch handled four, falling
through on `'paid'`. Money rows are owner-keyed, so a teammate on a **paying**
team reads back `accountStatus: 'unpaid'` from their own snapshot, and with
`/api/trial/start` 404ing under the flag their `trialUsed` can never become
true — so they hit the no-plan fallback and were told *"You have a 28-day free
trial available, no card needed"*, with a CTA to `/locked`, which renders the
wall for a team that already pays. The new branch is guarded on their **own**
status rather than their role, so a paying owner keeps the richer paid copy.
The pre-existing "a paid team falls through to the ordinary paid copy" test
covered only the owner, which is why this slipped through; the new test asserts
both roles.

**No changelog entry and no version bump.** `apps/homepage` changes never earn
one (Versioning: app-only scope), and the `billing-summary.ts` fix is dark
until the flag flips, where the activation checklist already requires the
ledger entry.

**Verified:** 914 tests pass, `eslint .` matches the measured baseline exactly
(3 errors / 65 warnings, all pre-existing `WorkspaceView.tsx`), homepage lint
clean, and `next build` green by **exit code** for both apps with `apps/web`
built in both flag states and `/auth`, `/onboarding`, `/settings` still
`○ Static` in each. The built homepage output was grepped to confirm no trial
claim survives outside `/changelog`. **Not verified:** the paid-team-member
copy has never rendered against a real session, so it rests on the unit tests
plus the traced precondition. Worth one look in Settings as a teammate after
the flag is flipped.
