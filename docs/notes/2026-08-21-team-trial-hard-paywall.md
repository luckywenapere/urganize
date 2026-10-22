# Team trial + hard paywall (2026-08-21; LIVE in production 2026-08-22, v0.60.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: replace open access with a **14-day full-access TEAM trial that
ends in a hard wall**. No permanent free tier. Pricing is founder-led sales, so
the wall is a sales signal as much as a checkout gate — "Talk to us" carries the
same visual weight as the plan picker, because a roster deal closes over an
invoice and a walkthrough. Built flag-off behind
`NEXT_PUBLIC_FEATURE_HARD_PAYWALL`.

**STATUS, corrected 2026-09-07: LIVE since 2026-08-22 — which this section's own HEADING and its "ACTIVATED 2026-08-22 (founder)" bullet have both said all along.** The opener said "not yet activated" underneath a heading reading "LIVE in production 2026-08-22, v0.60.0", so the contradiction was two lines wide and internal. The ledger confirms it: v0.60.0 leads *"Every team now starts with a 14-day free trial of the whole product, no card required."*

**Not a scope expansion.** Payments, the trial and `/locked` are all
pre-existing v1 machinery. What is new is that entitlement is now a TEAM
question, which is the "teammate subscription inheritance" landmine this file
has recorded as a blocker on restoring the paywall since 2026-08-18.

**This SUPERSEDES the card-before-trial flow** (`NEXT_PUBLIC_FEATURE_CARD_TRIAL`,
2026-08-18, never flipped). That one takes a card *before* the app and charges at
day 28; this one gives a team 14 days with no card and then walls. They are
opposite funnels and must never both be on. The card-trial surface stays in the
repo, flag off, untouched — nothing new imports it, and `TEAM_TRIAL_DAYS = 14`
in `lib/team-billing.ts` is deliberately NOT its `TRIAL_DAYS = 28` (which is
still load-bearing copy on `/terms` and the homepage).

**Pricing moved with it** (founder call): Monthly **₦80,000**, Annual
**₦800,000** in `packages/pricing` (team-priced, not per-seat). Marketing side
effect is nil — `/pricing` has shown no prices since 2026-07-23. Note annual NGN
now coincides with Label's stored ₦800,000; harmless, since Label is
`contactSales` and displays no figure.

**Eight things worth knowing before touching this:**

1. **Money rows stay per-OWNER; team facts live on `workspaces`.** The webhook,
   `subscriptions` and `payments` keep their keying untouched (rewiring the money
   path is high risk for no benefit). `workspaces.owner_id` is UNIQUE, so team
   and owner are 1:1 and the halves join cleanly.
   `lib/team-billing-server.ts:getTeamAccessForUser` combines them.
2. **The gate is ONE branch in ONE function.** All ~240 protected call sites
   reach `requireActiveAccount` through three lines in `app/api/_shared/auth.ts`.
   Flag off, `paywall.ts` is byte-identical, including the 2026-07-23 free-era
   early return.
3. **`combineTeamAccess` closes the teammate-shell leak.** Provisioning gives
   EVERY non-curator account its own workspace, so an invited teammate owns an
   empty shell with its own 14-day trial. Without the combiner they would keep
   working after their real team was walled. An owned team counts only when the
   person has no foreign teams or has releases of their own — mirroring the
   primary-workspace exception in `resolveWorkspaceAccessContext`. Zero
   workspaces fails OPEN, because the gate runs before provisioning.
4. **The 15-minute grace is server-only, and applies to ALL methods.** The fetch
   interceptor redirects on any same-origin 402 and the notifications bell polls
   a gated route, so without grace a trial lapsing mid-edit yanks the page within
   seconds. Clients pass `graceMs: 0` and `HardPaywallGate` draws the wall on the
   next navigation. That split IS the spec's "let the save finish, gate on next
   navigation" — do not "simplify" it to one number.
5. **The resolver FAILS OPEN**, unlike the per-user gate it replaces
   (`getFallbackSnapshot` fails closed). It joins four kinds of read, so it has
   more ways to break on infrastructure we do not control, and a wall is a sales
   gate rather than a security boundary (RLS and curator containment are
   untouched). Positive-only 30s cache, so a walled team's answer is never
   cached and paying/comping unlocks on the next request.
6. **`/api/trial/start` 404s under this flag.** It is an OPEN route granting a
   28-day PROFILE trial on nothing but `trial_used === false`, and the resolver
   honours an owner's profile trial — so a walled owner could POST once and walk
   back in. Not in the original spec; found while wiring the gate.
7. **Team checkout credits the OWNER, never the clicker.** `start-checkout`'s
   optional `workspaceId` resolves the subject through `resolveCheckoutSubject`
   and writes the owner into both the `payments` row and Paystack's
   `metadata.user_id`. Access resolves from the owner's snapshot, so crediting a
   paying admin would take the money and leave the team walled.
8. **`mark_paid` must NEVER write `profiles.is_subscribed`.** That flag grants
   paid access forever through `resolveSnapshot`'s back-compat branch with no
   expiry, so using it would turn a one-year invoice deal into a permanent one.
   The admin route writes the subscription with an admin-set `expires_at` plus a
   `payments` record row instead.

- **Copy rules, enforced by test not review:** never the word "workspace", no em
  dashes, no guilt or countdown pressure, and nothing threatening loss of
  access. `billing-alert-templates.test.ts` and `billing-summary.test.ts` both
  assert this on the customer-facing strings.
- **Founder alerts are email + a ledger, not `notifications`.** That table
  cannot carry them: `task_id` is NOT NULL with an FK to `tasks` and every
  `notification_type` value is task-scoped. `billing_events` (RLS on, zero
  policies) is the durable record and the dedupe store; the email is only the
  interrupt, so alerts still show in `/admin/teams` when mail is off.
- **The wall reports itself; the gate does not.** `POST /api/billing/track`
  fires once from the wall's mount, and the SERVER decides first-hit vs
  return-visit (deduped per UTC day). The gate fires many times per page and
  cannot tell a person from a background poll.
- **The trial indicator is above the topbar, not in it.** The topbar's right
  cluster carries a documented width budget that already overflows a 375px phone
  at eight controls. Not dismissible, deliberately: hiding it removes the one
  thing that stops the wall being a surprise.
- **`/admin/teams` is the migration summary** the spec asks for, and is
  deliberately NOT flag-gated so deals can be set up before the flip. It
  surfaces `grandfathered` (the `is_subscribed` back-compat branch) and
  `allowlisted` explicitly, or a legacy paid team would read as walled there and
  fine in the app.
- **Verification lesson worth keeping:** `next build` type-checks AFTER
  compiling, so grepping "Compiled successfully" does **not** prove a build
  passed — it masked a real type error here. Check the exit code. Also note
  `pkill -f "next start"` matches its own command line and kills the shell; use
  a PID file (the capture-feature trap, hit again).
- **The trial stamp is flag-gated, and that is a deploy-safety requirement.**
  `ensureOwnedWorkspace` writes `trial_started_at` / `trial_ends_at` only when
  the flag is on, because those columns do not exist until the migration is
  applied and that is a manual step AFTER this code deploys. Writing them
  unconditionally meant every new account's provisioning INSERT referenced
  columns the live database lacked: swallowed on the
  `loadWorkspaceAccessContext` path (`isTaskSchemaMissingError` matches `42703`
  and `PGRST204`) but silently leaving the account with no team, and worse on
  the routes that call it directly. Flag off, that INSERT is byte-for-byte what
  it was before this feature. Do not "simplify" the gate away.
- **ACTIVATED 2026-08-22 (founder).** The migration is applied, `/admin/teams`
  reviewed, `BILLING_ALERTS_EMAIL` set, and
  `NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true` is live in Vercel `Web` Production.
  **The recurring Paystack reprice trap is CLOSED for the first time:** Plans
  were minted at ₦80,000/₦800,000 and `PAYSTACK_PLAN_MONTHLY_NGN` /
  `PAYSTACK_PLAN_ANNUAL_NGN` repointed BEFORE the flip, so checkout charges what
  the picker advertises. That gap had come up four times (2026-07-14, -07-20,
  -08-16, and as the blocker on this feature) and this is the first pass that did
  not ship it. Ledger entry + version bump across all 10 `package.json` files
  landed as v0.60.0.
- **Two things the flip does NOT settle, both outstanding:**
  1. **Re-run the migration's backfill.** The trial stamp is flag-gated (see the
     bullet above), so any team created between applying the migration and
     flipping the flag has no `trial_ends_at`. Such a row fails OPEN — it reads
     as an active trial, never a wall — so this is tidying rather than a rescue,
     and it is idempotent: `update public.workspaces set trial_started_at =
     coalesce(trial_started_at, created_at, now()), trial_ends_at = now() +
     interval '14 days' where trial_ends_at is null;`. `/admin/teams` shows
     exactly who needs it.
  2. **Nothing has been verified against the live system yet.** Every claim in
     this section rests on unit tests, both-flag-state builds and route probes.
     Still to watch on real traffic: the pill appearing at ≤10 days, the wall in
     both owner and member variants, checkout crediting the OWNER rather than the
     clicker, the five founder alert types actually arriving, comp/extend
     restoring access immediately, and Settings reading correctly for a teammate
     on a paying team (the `'paid'` branch added 2026-08-22, which has never
     rendered against a real session).
- ~~**Out of scope, flagged for a founder copy pass:** `/terms` and the homepage
  `/signup` still say "28-day free trial".~~ **Done 2026-08-22** — see "The
  28-day trial promise, removed" below.
- **Not verified:** nothing has run against a real Supabase, Paystack or Resend
  — no migration applied, so the resolver, the wall, checkout, the alerts and
  the admin actions have never executed end to end. Unit-tested (939 tests) and
  both flag states build clean with runtime route probes, which is not the same
  as exercised.
