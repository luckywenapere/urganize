# Read-only on payment failure (2026-08-24)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The last item in the pricing spec, and the end of the binary access model.
Before this, a team that had been **paying us** and whose renewal charge failed
landed in exactly the same place as a team that never paid at all: the full wall,
catalogue included. That is the wrong treatment for the only churn event in the
system that is genuinely recoverable. Behind the existing
`NEXT_PUBLIC_FEATURE_HARD_PAYWALL`, so it is live wherever that flag is.

**No new flag and NO MIGRATION.** Read-only is derived, not stored, which is the
same thing as saying it is permanent: there is no second deadline to record.

**Policy (founder).** It begins when the paid period ends with the charge still
unpaid — Paystack's retries inside the period change nothing, because
`resolveSnapshot` already treats `past_due` + not expired as paid. It is then
permanent: no later wall. **Trial expiry still gets the wall**, which is the
founder's line from the pricing spec verbatim.

### Six things worth knowing before touching this

1. **`read_only` is a sixth `TeamAccessState` with a new `canWrite` axis, and
   that shape is forced.** `hasAccess: true` alone lets the gate through
   everything; `hasAccess: false` alone draws the wall, because
   `HardPaywallGate` redirects on `!hasAccess`. So read-only is
   `hasAccess: true, canWrite: false`, and every other state has
   `canWrite === hasAccess`. `HardPaywallGate` therefore needed **no behaviour
   change** — do not "tidy" it into a `canWrite` check, or the wall goes back in
   front of exactly the customers this exists for. A test pins that.
2. **The discriminator is `profiles.paid_at` on the owner, and not a status
   string.** It is the one unambiguous "real money landed" marker in this schema:
   written by exactly the two webhook paths where a charge succeeded, and
   deliberately withheld by the card-verification path (whose own comment says
   "nothing has been bought yet"). **Do not widen it to
   `subscriptions.status === 'cancelled'`** — a cancelled card-trial wears that
   status and never paid a penny, so reading the status would hand read-only to
   the teams the founder decided keep the wall. `lapsedFromPayment` is the pure,
   tested predicate, and mutating it to ignore `paid_at` fails the
   "trial expiry keeps the wall" test.
3. **THE REFUSAL IS 403, AND MUST NEVER BE 402.**
   `lib/access-redirect.ts` patches `window.fetch` and redirects the browser to
   `/locked` on any same-origin 402, so a 402 here would eject a read-only team
   from the app on their first blocked save — the very wall this replaces. 403 is
   also the honest code and the established precedent:
   `buildReadOnlyResponse` in `lib/tasks-server.ts` already refuses a guest's
   writes with a flat `{ error }` at 403, and every mutation surface renders that
   string unchanged. `READ_ONLY_REFUSAL_STATUS` carries an explicit
   not-`ACCESS_REQUIRED_STATUS` test for this.
4. **The gate refuses by HTTP method, threaded from three call sites.**
   `request.method` now reaches `requireActiveAccount` from
   `requireActiveAuthenticatedUser`, `requireActiveAuthenticatedUserOrInternal`
   and `requireAuthenticatedAdminOrInternal` in `app/api/_shared/auth.ts` — all
   three already had the request in hand, so every gated route inherits this from
   three lines. GET/HEAD/OPTIONS pass; an absent method counts as a write. The
   imprecision runs both ways and both are accepted: **a writing GET still
   writes**, which is a requirement rather than a leak (lazy workspace
   provisioning, the `metadata_viewed` stamp whose failure fails the whole read,
   and the default task-group insert all happen on GETs — gating them would stop
   a first page load resolving), and **a few non-GET pure reads are
   over-refused** (the genre-prediction proxy, the AI status generator), which is
   harmless because the PATCH that would save either result is refused anyway.
5. **No exemption list is needed, and that was verified rather than assumed.**
   All five `/api/billing/*` routes and `/api/account/export` use
   `getAuthenticatedUser`, so they are open and never reach the gate. The path
   *out* of read-only (checkout, plan change, notify-admin, track) and the path
   *to their data* (export) therefore keep working with no special case.
   `POST /api/urgans` IS gated, so **the assistant is unavailable in read-only
   mode**, deterministic chips included — a decision, not an oversight: a lapsed
   team does not get billed model calls.
6. **The bug class this feature creates: read-only has `hasAccess: true`, so
   every existing path to `/locked` bounced it.** Three separate dead ends, all
   fixed together and all worth remembering if a fourth link is ever added:
   `TeamWall`'s has-access effect (needed `intent=reactivate` in its
   deliberate-visit set), `handleActivate`'s change-plan branch (gated on
   `hasAccess`, which sent a read-only team to a route that refuses with
   `no_active_period` — now gated on **`canWrite`**, so it and `quotePlanChange`
   agree by construction), and Settings' CTA (a bare `/locked`, now the new
   `'reactivate'` CTA). Every link that sends someone here carries
   `READ_ONLY_REACTIVATE_HREF`.

### Two smaller decisions

- **`mark_paid` now stamps `profiles.paid_at`** (coalesced, best-effort, never
  overwriting an earlier one). It did not, so an invoice-settled Label or
  Enterprise team — exactly the customer most likely to be on an invoice — would
  have hit the full wall when their year lapsed. Safe and provably so: `paid_at`
  grants nothing on its own, since inside `resolveSnapshot` it only ever chooses
  between `expired` and `unpaid`, both no-access. **The prohibition on
  `mark_paid` writing `is_subscribed` still stands** — that one grants paid
  access forever with no expiry.
- **The founder is alerted at `invoice.payment_failed`, not at the lapse.** That
  is the only point where a churn event is both known and still cheap to fix:
  retries are pending, the customer has full access, and a message about a card
  takes a minute. New `payment_failed` billing event (the column is free text, so
  no migration) plus a `CARD FAILED` founder alert, fire-and-forget under the
  flag, mirroring the `checkout_completed` block beside it — an alert must never
  fail a webhook.

### What is NOT built, deliberately

- **No write affordance is disabled anywhere.** `TeamReadOnlyStrip` (above the
  topbar, not dismissible, the `TeamTrialStrip` shape) is the communication and
  the server's 403 message is the per-action explanation — the same division the
  seat cap already uses. Disabling every mutating control in the product is a
  much larger piece of work.
- **No grace window.** Grace exists because a 402 yanks the page; a 403 does not,
  so the worst case at the transition is one failed save with a visible message.
  Note the one place that stings: `PUT …/plan` is a debounced autosave, so a
  refusal there discards in-progress typing rather than just refusing an action.
- **The `paywall_view` tracking is untouched.** A read-only team has access, so
  it never fires — `paywall_hit` means the wall and should keep meaning that. The
  `payment_failed` alert is the signal for this state.
- **Precedence is unchanged above read-only.** Allowlist, owner-paid, comped, a
  live trial and the `no_trial_stamp` fail-open all still win, so switching this
  on cannot take anything away from anyone. Fail-open sitting ABOVE read-only is
  deliberate: an unstamped team that also lapsed from payment gets full access,
  because our missing backfill must never cost a customer their writes.

### Verified

**1169 tests** (23 new), `eslint .` at the exact **3-error / 66-warning** baseline
(all three errors pre-existing in `WorkspaceView.tsx`), `next build` green **by
exit code** with the hard paywall off and on, `/auth`, `/onboarding` and
`/settings` still `○ Static` in each. Runtime probes in both flag states,
rebuilding between them because `NEXT_PUBLIC_*` is inlined at build time even
server-side: gated routes 401 unauthenticated (so the gate's ordering is intact)
and `/api/billing/*` 401 rather than 403 (so they never reach the gate).
**Mutation-tested rather than merely asserted:** making `lapsedFromPayment`
ignore `paid_at`, letting POST count as a safe method, and changing the refusal
status to 402 each fail exactly the test written to catch them.

**Not verified, and this is the significant gap.** Nothing has run against a real
database or Paystack: no renewal has failed, no team has gone read-only, the
strip and the reactivate flow have never rendered in a browser, and the founder
alert has never been delivered. Worth one real pass once a tier subscription
exists — let a renewal fail, confirm access continues to `expires_at`, then
confirm the strip appears, a save is refused with a readable message, "Update
payment" reaches the picker rather than bouncing, and paying restores writes on
the next request.
