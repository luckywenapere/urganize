# Card before the free trial (2026-08-18)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: "find a service for users to put in their card details before
accessing the free trial. it should be the first thing after they are
onboarded on the app" — reference screenshots of Intercom's Early Stage
checkout (card required, "Due today $0", trial converts automatically).

**Not a scope expansion.** Payments and the 28-day trial are both pre-existing
v1 machinery; this changes WHEN the card is collected, not what is sold. It
also finally uses a state the schema has always allowed and nothing ever wrote
(`subscriptions.status = 'trialing'`), and reads the `PaystackAuthorization`
type the webhook has declared-but-never-read since it was written.

**Service: Paystack** (already integrated). Verified against Paystack's own
docs before building: there is **no ₦0 card-save** — regulators require a real
2FA-authenticated charge, with a documented ₦50 tokenization minimum — and
`POST /subscription` accepts **`start_date`**, which is Paystack's documented
free-trial mechanism (first debit delayed to trial end). Stripe, which the
reference screenshots use, does **not** onboard Nigerian businesses; Stripe
acquired Paystack in 2020, so Paystack *is* the Stripe network here. So the
Intercom UX is reproducible in full except the literal "$0 today": we take a
**₦100 card check and refund it automatically**.

**Founder decisions (all four asked before building):** Paystack · auto-refund
the ₦100 · keep 28 days (terms, the /pricing FAQ and /locked all say 28) ·
**new signups only**. The two paywall kill-switches stay OFF — this ships as
product friction on the signup path, not a restored paywall.

- **Flag:** `NEXT_PUBLIC_FEATURE_CARD_TRIAL`, default `false`. Registered in
  `turbo.json` + `.env.example`. **No migration** — `subscriptions.status`
  already allows `'trialing'`, `payments.plan` is free text, `payments.status`
  already allows `'failed'`, and `profiles.created_at` already exists.
- **The flow:** onboarding → `/start-trial` (pick Monthly/Annual, NGN only) →
  `POST /api/trial/start-checkout` reserves a `payments` row with the
  `trial_card` sentinel and sends the user to Paystack (`channels:['card']`,
  **no `plan` param** — a plan param would charge full price immediately) →
  `charge.success` → the webhook's `handleTrialCardCharge` → `/payment/callback`
  says the trial started → dashboard.

**Six things worth knowing before editing this feature:**

1. **The webhook branch diverts BEFORE the generic status flip**, because a
   ₦100 card check is not a purchase — falling through would mark the user
   subscribed. Its order is load-bearing: idempotency check → **compare-and-set
   claim** (`status='success' WHERE status='pending'` with `.select()`) →
   validate plan + reusable authorization → create the delayed subscription →
   `subscriptions` + profile trial fields → **refund last, log-only**. The CAS
   is what makes everything downstream at-most-once: two concurrent deliveries
   would otherwise both create a delayed subscription, i.e. a **double charge on
   day 28**.
2. **Trial→paid conversion is ZERO new code.** On day 28 Paystack charges the
   saved card; that `charge.success` has a fresh reference, so it misses the
   payments lookup and lands in the existing renewal path, which matches by
   `paystack_subscription_code` and flips the row to `active`. Do not add a
   second conversion path.
3. **The signup cutoff (`TRIAL_CARD_SIGNUP_CUTOFF`) is not optional
   bookkeeping.** The paywall has been off since 2026-07-23, so plenty of
   EXISTING accounts sit at exactly `unpaid` + `trial_used: false` — the naive
   predicate. Without the cutoff, flipping this flag would wall established
   users. Unset ⇒ the login-time bounce is inert (and logs a warning).
4. **Invited teammates are exempted by an active non-owner `workspace_members`
   row**, not by role: an existing account that accepts an invite keeps its old
   role, and owner rows exist for everyone via the lazy workspace bootstrap
   (hence `role != 'owner'`). Teammates have their own `unpaid` snapshot and
   must never be asked to pay for a workspace they were invited into.
   `resolveCardTrialRequirement` fails OPEN on every unknown — the
   `isFirstReleaseRequired` doctrine.
5. **`/start-trial` deliberately does NOT gate on `cardTrialRequired`.** That
   field drives only the login-time bounce. Gating the page on it too would
   make a flag-on / cutoff-unset deploy bounce brand-new signups straight back
   to the dashboard, silently no-opping the whole feature.
6. **`POST /api/trial/start` 404s under the flag** — otherwise the card is one
   POST away from being bypassed. Onboarding's call is wrapped in the flag
   (404 is not in its tolerated {400, 409} set, so an unconditional call would
   throw) and `/locked`'s trial button routes to `/start-trial` instead.
   `/api/promo/redeem` writes the trial fields directly and stays card-free by
   design.
7. **The in-session gate (2026-08-21) is the third bounce, and it exists
   because the first two both miss how the signup funnels actually end.** The
   founder's own live test hit it: a fresh account creating its first release
   as a blank rollout reached the app with no billing surface anywhere. Two
   causes stacked — the flag was (and is) off in production, but even flag-on
   the flow leaked: the auth-store bounce fires only on FULL page loads and
   early-returns on safe paths, while `/auth/callback` runs `checkAuth` with
   the pathname still `/auth/callback` (a `/auth` safe path) and then
   `router.replace()`s to the dashboard — so a new Google signup lands in the
   app as pure SPA navigation and the bounce never fires for the whole
   session. Email login on `/auth` races the same way, and Back from
   `/start-trial` → `/onboarding` → its authenticated redirect → dashboard is
   three SPA hops with no full load. `CardTrialGate`
   (`components/providers/CardTrialGate.tsx`, mounted by `AppShell` beside the
   other bridges) closes all three: whenever `/dashboard`, `/settings` or
   `/admin` is reached in-session it consults the server's `cardTrialRequired`
   and routes to `/start-trial` when true. Fail open on every uncertainty;
   `required: false` is cached per user for the tab (the predicate is one-way
   for an account — every false state is permanent); `required: true` is
   deliberately re-asked on each gated entry so a checkout completed on
   `/start-trial` clears it without a reload; the redirect re-reads
   `window.location.pathname` at resolve time (the MobileNavBar
   click-time-fresh-read pattern) so gated→gated navigation mid-fetch still
   bounces and landing on `/start-trial` mid-fetch never double-fires. The
   decision halves are pure and unit-tested (`isCardTrialGatedPath`,
   `shouldConsultCardTrialGate` in `lib/trial-card.ts`); `/curator` and the
   public token pages are deliberately outside the gated set, so the free
   curator side stays free. **Coverage audit (2026-08-21), so nobody re-walks
   it:** every other route is a redirect stub (`/`, `/release/[id]` →
   gated paths), a public token page, or a flow page (`/auth`, `/onboarding`,
   `/start-trial`, `/locked`, `/payment`, `/redeem`, `/invite`, `/join`) with
   no product surface on it — and in production config every ASSISTANT
   surface also lives inside gated chrome: the rail and MobileNavBar mount
   only under `showWorkspaceChrome` (dashboard/settings), `/dashboard/urgans`
   is gated by prefix, and ChappiDock renders nowhere because
   `NEXT_PUBLIC_FEATURE_MOBILE_NAV=true` (its unconditional bail). One
   residual, documented rather than plumbed: with mobile-nav OFF, the
   below-lg dock renders on the three authenticated flow pages
   (`/payment/callback`, `/redeem`, `/join/[code]`), so a card-gated account
   that hand-typed one of those URLs could chat with UrgAns there — no UI
   path leads a card-gated account to any of them today, but re-check this
   before ever turning mobile-nav off. The API layer stays open either way
   (the server paywall is off — the founder-accepted known limit at the end
   of this section), so this gate is a UI wall, not an API one.
8. **Google signups go through the wizard before billing (2026-08-21), so
   every funnel has its dopamine hit first.** `/auth` is login-only — signup
   lives at `/onboarding` — so the ONE account-creating path that skipped the
   wizard was Google from the login page: the callback's profile upsert
   creates the account, and nothing routed it to onboarding. That account
   reached billing having created nothing, while an email signup got its
   release and plan first. Now `/onboarding?setup=1` runs the wizard in
   **authed-setup mode**: the account already exists, so step 5 (Create your
   account) is skipped and step 4 becomes terminal ("Create my release"),
   running the SAME `runPostSignupHandoff` both signup paths run against the
   session in hand, then landing on `/start-trial`. Order is now identical
   everywhere: questions → your release and its plan → billing → the app.
   Five things worth keeping:
   - **The param is read imperatively in the pre-paint layout effect, never
     via `useSearchParams`** — that hook in a statically prerendered client
     component serves `loading.tsx` as the page's HTML, the exact
     weak-connection dead end of 2026-08-13. `/onboarding` and `/auth` are
     both verified still `○ Static`, with the real step-1 questions in the
     server HTML.
   - **The param alone never grants the mode** (`shouldRunAuthedOnboardingSetup`,
     unit-tested): the flag must be on, auth resolved, the account genuinely
     un-onboarded (an explicit `false`, never a missing field) and not a
     curator — so a stale link cannot re-run the wizard for someone who
     finished it, and a normal `/onboarding` visit is untouched.
   - **The bounce-home effect is gated on `hasHydrated`**, because the param
     lands in state: acting before hydration would eject the one visitor this
     mode exists to serve. `accountCreated` is set before the hand-off for the
     same reason — its PATCH flips `onboarding_completed` to true, which would
     otherwise end the mode mid-run.
   - **The callback's routing is a SHORTCUT, not the gate.** CardTrialGate
     reaches the same wizard from `/dashboard` anyway; deciding at the
     callback only skips a flash of the app and its create-release modal. It
     consults the server's `cardTrialRequired` (not just
     `onboarding_completed`) because only the server can evaluate the
     server-only cutoff and workspace membership — that read is what keeps
     pre-cutoff dormant accounts, invited teammates and curators out of the
     wizard. It is skipped entirely for already-onboarded accounts, bounded by
     a 2.5s abort well inside the callback's 7s watchdog, and every failure
     falls through to the app rather than the wizard.
   - **Invited teammates were already safe**: `/api/invites/[token]` marks
     `onboarding_completed: true` on accept, for this exact reason ("the
     first-time onboarding wizard is wrong for them"). The membership
     exemption in `cardTrialRequired` is the second layer.
   The destination split lives in one tested place (`resolveCardTrialDestination`):
   never-onboarded → the wizard, onboarded or unknown → `/start-trial`. Both
   bounces (auth-store on full loads, CardTrialGate in-session) call it, and
   `/api/subscription-status` now returns `onboardingCompleted` alongside
   `cardTrialRequired` to feed it.

- **The cancel path closes the deleted flow's worst gap.** The 2026-06-05
  card-on-file flow (never live) had no refund and **no way to stop the
  scheduled charge** — the card was billed at `start_date` even if the user
  quit. `POST /api/billing/cancel-trial` disables the Paystack subscription
  using the `email_token` stashed on the payments row, sets `cancelled` and
  **keeps `expires_at`**, so access runs to trial end and then lapses.
  Deliberately NOT flag-gated and deliberately open-route: an in-flight trial
  must stay cancellable after a rollback, and a just-lapsed user must still be
  able to stop an imminent charge.
- **The `trial_card` sentinel survives account deletion**, joining
  `trial_claim` in the `delete-now` carve-out — that is what stops
  delete-and-resignup from reclaiming a free trial.
- **Verified:** `vitest run` (741 passing, 24 env-gated skips; ~54 new across
  `lib/trial-card.test.ts` and the billing-summary additions), `eslint .`
  (3 errors / 63 warnings vs a measured 3/61 baseline — the 3 errors are the
  pre-existing `WorkspaceView.tsx` ones, and the 2 new warnings are the
  documented React-19 `set-state-in-effect` downgrade on the iOS-detect and
  fetch-on-mount effects, the same pair `LockedPageClient` already carries),
  and `next build` green in **both** flag states with `/auth`, `/settings` and
  `/start-trial` all still `○ Static`. Runtime probes proved the gate rather
  than assuming it: flag OFF → `/api/trial/start-checkout` **404** while
  `/api/trial/start` **401**; flag ON → **inverted**; the ungated
  `/api/billing/start-checkout` 401s either way.
- **Not verified:** nothing has run against a real Supabase or Paystack — no
  real card, no webhook delivery, no refund, no delayed subscription, no
  cancel, and none of the redirects against a real session. The owner UI needs
  an authenticated session this environment cannot mint.
- **Activation checklist:** (1) **THE blocker — mint NGN Paystack Plans at the
  CURRENT prices (₦3,500 / ₦35,000) and repoint `PAYSTACK_PLAN_MONTHLY_NGN` /
  `PAYSTACK_PLAN_ANNUAL_NGN`.** The plans those vars point at still bill
  ₦150,000 / ₦1,500,000 (the documented 2026-08-16 reprice gap), and that is
  exactly what a converting trial would charge on day 28. (2) Set
  `NEXT_PUBLIC_FEATURE_CARD_TRIAL=true` **and** `TRIAL_CARD_SIGNUP_CUTOFF` to
  the flip moment in Vercel `Web`, and make sure the deploy actually rebuilds
  `apps/web`. (3) Changelog entry + minor version bump across all 10
  `package.json` files (the EPK precedent: the ledger entry lands at
  flag-flip, not at merge). (4) Probe production: unauthenticated
  `/api/trial/start` → 404 and `/api/trial/start-checkout` → 401 proves the
  flag is live in the deployed bundle. (5) End-to-end with a real card and a
  throwaway email; in Paystack confirm the subscription exists with
  `start_date` ≈ +28 days **at the new amount** and that the ₦100 was
  refunded; then cancel from Settings → Billing and confirm Paystack shows it
  disabled while access continues. (6) Sign in as a pre-existing account and
  as a teammate — neither should be redirected anywhere.
- **Known limit (founder-accepted):** with the server paywall off, this is
  client-side product friction on the signup path, not an API gate — the same
  posture every free-era account already has. Restoring the real paywall later
  additionally requires solving teammate subscription inheritance, which is a
  documented landmine and out of scope here.
