# The other two caps: archive, active releases, assistant actions (2026-08-23)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The rest of the pricing spec's §3. Same PR as the seat cap above, same
structural inertness (nothing can write the capped tier yet, so nothing is
enforced on any real team today), same **no feature flag** for the same reason.
One new user-facing surface — archiving a release — which ships **unflagged**;
that is the unusual call and it is argued below.

### Archiving, and why it had to come first

An `active_releases` ceiling with no way to free a slot is a cap on
releases-ever-created. Nothing in the product had ever written
`releases.status = 'archived'`, so the cap needed the action, not the reverse.

- **`POST /api/releases/[releaseId]/archive`**, body `{ archived: boolean }`. A
  dedicated route rather than `PATCH`, and that is not a style preference: the
  release PATCH handler is a **full-row replace** — it unconditionally writes
  title, slug, release_date, description, artist_name and status from the body —
  so a sparse `PATCH { status: 'archived' }` blanks the description and then 400s
  on the now-empty title. This route writes `status` and `updated_at`, nothing
  else. (Chappi's `update_release` works around the same trap by reading first
  and merging; see its tool-family note.)
- **Restore is the same endpoint with `archived: false`.** An archive that cannot
  be undone reads as a delete and gets treated like one — people avoid it, keep
  dead releases on the board, and the ceiling stops meaning anything. Restoring
  writes `draft` because nothing records what the status was before, which is
  recorded on `RESTORED_STATUS` rather than left to be rediscovered.
- **Unflagged, deliberately.** `update_release` already accepts
  `status: 'archived'`, is **not** confirmation-gated, and the assistant is live
  in production — so archiving is already reachable today, and every path
  downstream of it (the identity card's active count, recap eligibility) is
  already live. A button adds a deliberate way to reach a state the assistant can
  already produce, not a new behaviour class. It also keeps the cap's copy
  honest: "archive one you have finished" must never be advice a user cannot
  take.
- **A real lie fixed on the way.** `GET /api/releases/[releaseId]` overwrote
  stored status with a computed progress read-out that can only be
  `draft | in_progress | ready`, so an archived release read back as `draft`.
  That endpoint was the only place in the app that did this — every other read
  path returns the stored value. It now preserves a terminal status and computes
  otherwise: the user's explicit statement outranks any derivation.
- **UI:** a `TaskPanelAction` built in `WorkspaceView` beside `recapAction`, so it
  lands in the desktop header row and the mobile folded "more" menu — the two
  places `recapButton` appears, because both are modal-shaped and neither would
  ever light up among the mobile top tabs. Offered on the same eligibility the
  recap uses (**"worth celebrating" and "safe to shelve" are the same moment**),
  or unconditionally as **Restore** once a release is archived.
  `ArchiveReleaseDialog` is modelled on `DeleteReleaseDialog`, whose portal is
  **mandatory** rather than stylistic (AppShell's `lazy-fade` transform breaks
  `position: fixed` for every descendant) — but deliberately **not** styled
  destructive. Archiving loses nothing and the same button undoes it; borrowing
  the delete dialog's red teaches people to fear an action whose whole purpose is
  to be safe.
- **`isRecapEligible` was DUPLICATED in `WorkspaceView.tsx`** — a hand-rolled
  copy that "mirrored" `lib/recap-eligibility.ts`. The archive action made that
  duplicate load-bearing for a second feature, so it now calls the shared
  predicate. Behaviour-identical (`parseReleaseDate` builds the same
  `T00:00:00` date the copy did), and `lib/recap-copy.ts` has no imports at all,
  so nothing server-side follows it into the client bundle.
- **`isReleaseActive` (`lib/release-activity.ts`) is the one definition** of
  "still being worked": not `released`, not `archived`, with an unknown status
  counting as active. Extracted from `WorkspaceIdentityPanel`'s local Set, which
  now imports it, so the number the card shows and the number the cap counts
  cannot disagree. It is deliberately **not** `isRecapEligible`, which answers a
  different question ("finished enough to celebrate") using dates and task
  counts.
  **NAMING:** `lib/release-status.ts` was already taken by the AI status-update
  generator's prompt builders. This module was briefly written to that path
  during the build and clobbered it; the collateral deletion of
  `lib/release-status.test.ts` went unnoticed until `tsc` reported five missing
  exports. If a future change wants a "release status" helper, it goes here.
- **The cap** sits in `POST /api/releases` immediately before the insert — after
  every validation, so a refusal is the last word rather than pre-empting a 400
  the caller should see first, and before anything is created, so a refusal
  leaves nothing half-made. The pre-existing count a few lines above has **no
  status predicate on purpose** (it feeds first-release analytics and means
  "releases ever"); the cap adds a filtered one rather than changing it.

### The assistant action ceiling

**The period is computed, not stored, and that is the whole design.** You cannot
get a period start by subtracting an interval from `subscriptions.expires_at`:
the renewal path advances it with `setMonth(+1)` / `setFullYear(+1)`, which
**clamps** on short months and re-adds from the already-clamped value, so a
derived anniversary drifts every cycle; the interval is **not recoverable** from
`subscriptions.plan` under the tier model (neither `manager` nor `label` says
monthly or annual, and nothing stores it); and an admin `mark_paid` writes an
arbitrary term while `custom` is +100 years. So `lib/urgans-usage.ts` takes
**only the day-of-month** as an anchor and builds the window containing `now`
from `now`. Nothing accumulates, so nothing drifts, and a test walks twelve
consecutive months to prove it. Month-end clamps to the last day, the way every
subscription service does.

**Monthly windows for everyone (founder call), including annual subscribers.**
The entitlement is named `urgans_monthly_actions`; 150 actions for a whole year
on the plan we most want people on would be a mis-sale.

**Five things worth knowing before editing this:**

1. **The check sits INSIDE `if (!confirmedAction)`**, immediately before
   `runChappiAgent`, and the placement is the point. The confirmation replay
   calls the model too (`closeConfirmedAction` writes the closing line), so a
   check one block earlier would bill a user an action for clicking Approve on a
   permission card — and would refuse to finish an action they had already
   authorised. `action-ceiling.test.ts` pins this, and it was **mutation-tested**:
   moving the block above that branch makes exactly that test fail.
2. **At the ceiling the reply is `mode: 'deterministic'`, not an error** (founder
   call). The client's keyword router and action chips keep working, so a capped
   team can still create releases, activities and notes by typing. That path
   makes no model call, costs nothing, and is already what production serves
   whenever no model is configured. The `deterministic` variant gained an
   optional `notice` so the UI can say why the answer reads differently rather
   than silently serving a terser assistant.
3. **429 is the status**, and it is not otherwise emitted by this route — the
   catch block maps an upstream 429 down to 503 — so a 429 here unambiguously
   means "your ceiling", never "gateway busy".
4. **One action per TURN, not per gateway round.** `runChappiAgent` loops up to
   `MAX_ROUNDS = 5`; the billable unit is one POST reaching the agent. Recorded
   **after** the turn succeeds, so a gateway failure is never charged (also
   tested).
5. **Storage is `billing_events`, with no migration.** Its `type` column is free
   text by design and its existing `(workspace_id, type, created_at desc)` index
   is exactly the access path for `count where workspace = ? and type = ? and
   created_at >= ?`. At 150 rows per team per window that is nothing.

**Fails open throughout**, consistent with the tier resolver, the seat counter
and the release counter: an unresolvable team, an unresolvable tier or an
unreadable count all mean "do not enforce". `countBillingEventsSince` returns 0
on error, so a database blip grants a few extra assistant turns — the right
direction to be wrong, because falsely refusing a paying customer their
assistant is much worse than serving a few free ones.

**The 80% banner** is `UrgansUsageStrip`, mounted in `AppShell` beside
`TeamTrialStrip` and carrying that component's contract wholesale: above the
topbar rather than in it (the right cluster's width budget already overflows a
375px phone), calm (no reddening, no escalation, no warning icon), and **not
dismissible**, since dismissing hides the one thing that stops the ceiling being
a surprise. Two details that are easy to get wrong:
- **It is fed by its own `GET /api/urgans/usage`**, not a field on
  `/api/subscription-status`. That payload is cached 20s client-side and 30s
  server-side, and this number changes on every turn — a cached count would go
  stale exactly when it matters.
- **It refetches on conversation activity**, because it is mounted in AppShell
  and therefore survives navigation: a mount-only fetch would answer once per
  full page load, and a heavy session could cross 80% and hit the ceiling with
  the warning never appearing. It subscribes to `useChappiStore.messages.length`
  (over-triggering slightly, since a deterministic chip costs no action but still
  appends a turn — the harmless direction) and latches `noCeiling` on the first
  `limit: null`, which stops it fetching for the rest of the session. Tier only
  changes through a checkout, which returns via `/payment/callback` and reloads
  the app. Today that latch fires for everyone.

### Pricing v2 is NOT flippable by minting Paystack Plans alone

**A correction to the activation checklist in "Pricing tiers + the entitlement
map" above**, found while planning this pass. Two pre-existing bugs sit in the
checkout/renewal path, invisible today only because no tier id can reach it:

1. **`getPlanExpiry` (`lib/billing.ts`) matches plan NAMES**, so `'manager'`
   falls through to +1 month and `'label'` matches +1 year *whatever interval was
   actually bought*. A Label-monthly buyer would get twelve months of access for
   one month's money; a Manager-annual buyer one month for a year's.
2. **`isRecurringPlan` (`lib/billing-plans.ts`) returns false for tier ids**, so
   the webhook bails at `non_recurring_subscription` and **renewals silently stop
   extending** — the exact hazard the pricing migration's own header warns about.

Root cause is the same in both: **under the tier model `plan` no longer encodes
the interval, and nothing stores it.** `PLAN_CODE_ENV_VAR` has no `manager` entry
either, so the two env vars that checklist documents are read by nothing.

**Not fixed here** — this is checkout and renewal, not enforcement, and folding
it into an already-large PR would bury it. It should be the next PR, and **it
blocks the flag**: minting Manager's Paystack Plans is necessary but not
sufficient.

**RESOLVED 2026-08-24** — see "Tier checkout and renewal" below. Both bugs are
fixed and the interval is now stored on `subscriptions.billing_interval`. Left
as written above because the diagnosis is the useful part: it is the reason that
column exists, and the reason a plan name must never be read as an interval
again.

### Verified

The full suite (**1076 passing**, 24 env-gated skips, of which 26 are new across
`release-activity.test.ts`, `urgans-usage.test.ts` and `action-ceiling.test.ts`),
`eslint .` at **3 errors / 66 warnings** — the 3 errors are the unchanged
pre-existing `WorkspaceView.tsx` ones, and the single new warning is
`ArchiveReleaseDialog`'s portal mount guard, byte-for-byte the finding
`DeleteReleaseDialog` already carries (the documented React-19 downgraded rule).
`next build` green **by exit code** with pricing v2 both off and on under
production config (`NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true`), `/auth` and
`/settings` still `○ Static` in each. Runtime probes, rebuilding between them
because `NEXT_PUBLIC_*` is inlined at build time even server-side: Chappi on,
`/api/urgans/usage` **401**s unauthenticated; Chappi off it **404**s while the
ungated control `/api/releases` still **401**s, which is what proves the 404 is
the gate rather than a routing accident. The archive route 401s in both states,
as an unflagged route should.

**Not verified:** nothing has run against a real database, so **no cap has ever
actually refused anything** and no release has been archived end to end. The
archive dialog and the usage strip have never rendered in a browser — the owner
UI needs an authenticated session this environment cannot mint. All of it rests
on unit tests plus traced call paths. Worth one manual pass once `manager` is a
reachable plan: archive a finished release and confirm the catalog grid and the
identity card's count both update without a reload, then restore it.
