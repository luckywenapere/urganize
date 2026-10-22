# The first-rollout share offer waits for the next visit (2026-10-13, v1.120.2, no flag)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

A prospect, in a live walkthrough, called the share sheet "too early": after
creating a first rollout inside the app, "Tell people it’s coming" opened
before the planner, so he was asked to announce a rollout with no plan behind
it. Onboarding had already moved its offer to Home on the next visit
(v1.105.0); every other way in still opened it on the spot. Now none do.

- **`withFirstShareOffer` saves, it does not show.** It still wraps each
  create flow's continuation (the workspace, `RolloutCreateFlow`, AppShell's
  modal), but it now records a deferred offer through `deferFirstShareOffer`
  and runs the continuation straight away. UrgAns's `create_release` (and a
  reply that lands after you left the chat) call `deferFirstShareOffer`
  directly. Same checks as before: share on, a first rollout (the server's
  answer), not already offered, a signed-in person.
- **The record** is `urganize.share.deferred-first` in localStorage (person,
  rollout, time, and the id of the tab it was made in, kept in sessionStorage),
  in `lib/social-share-offer.ts`. `decideDeferredFirstShare` offers it only to
  the same person, only on Home, only in a later visit (a new tab, or the same
  tab after 12 hours) and only within 14 days. It calls onboarding's
  `decideDeferredShareOffer`, so the two records follow ONE rule.
- **`ShareSheet`'s `useDeferredFirstShareOffer`** reads both records
  (onboarding's first, then this one), waits for a quiet moment (no modal, no
  tour, not the quiet first session after onboarding), clears both, and opens
  the sheet once. The old per-tab "pending" marker and its hook are deleted:
  nothing wrote it any more.
- **Cleared on sign-out** (`clearDeferredFirstShare` in the auth store), like
  the first-session record. The once-per-person "offered" list is unchanged.
- The create modal no longer passes the new rollout's facts (`share`) to its
  callers: they were only there so the sheet could open before the catalog
  caught up, and by the next visit it has.
- Guard: `lib/first-user-flow-guard.test.ts` fails if any file under
  `components/` or `app/` other than `ShareSheet.tsx` opens a
  `'first_release'` sheet.
- **Not verified in a browser or with a real session.** Worth one pass: create
  a first rollout in the app and confirm no share sheet; open the app in a new
  tab and go to Home and confirm the sheet offers itself once.
