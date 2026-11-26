# Day Zero lifetime deal (2026-11-26, v1.295.0, #1393, no flag)

Urganize is sold as a lifetime deal on Day Zero (dayzero.ltd), which works like
AppSumo Licensing v2: a signed webhook for license events, and an OAuth redirect
that brings the buyer back to claim the license. **One active license gives the
account it is attached to Pro (code id `manager`) for life** (founder call,
2026-11-26). Mocks: `docs/mocks/dayzero-activation/mock.html`.

## How the plan is granted

Nothing is written to `subscriptions`. `getSubscriptionSnapshot`
(`lib/subscription-access.ts`) also reads `dayzero_licenses` for an active
license on the user and folds it in with `applyLifetimeLicense`
(`lib/dayzero-shared.ts`): no plan, a trial, a lapse, Solo or Solo Plus become
paid on `manager` with `expiresAt: null` and `lifetime: true`; a paid plan at or
above Pro is left alone. Every access decision (paywall, team access, tier,
credits allowance) already runs through the snapshot, so nothing else changed.
Why not a `subscriptions` row: a Paystack renewal upserts that row and would
overwrite the grant, and a refund would have to rebuild what was there before.

- **Refund** (`deactivate`): the license row goes to `deactivated`, so the
  snapshot stops folding it in and the team meets the plan wall like any team
  with no plan (founder call: the wall, not read-only). Their work is kept.
- **Already paying by card**: Pro is added and the founder gets a
  `dayzero_card_plan_cancel_needed` email (BILLING_ALERTS_EMAIL) to cancel the
  Paystack plan by hand. Nothing cancels it automatically (founder call).
- **Card trial abroad**: a lifetime account is never sent to `/add-card`.

## Pieces

- `POST /api/dayzero/webhook`: hex HMAC-SHA256 of `X-DayZero-Timestamp` + raw
  body with `DAYZERO_API_KEY`, timing-safe, else 401. `test: true` never touches
  the database. purchase creates an inactive row (never demotes one), activate
  sets active, deactivate sets deactivated; upgrade, downgrade and migrate move
  the owner from `prev_license_key` to the new key and deactivate the old one.
  A refund is final: once deactivated, no activate brings Pro back (only an
  upgrade or migrate to a new key). Not ordered by timestamp, because a retried
  webhook may carry a fresh `event_timestamp` (Codex review on #1397). Answers 200 `{success, event}`; a database error
  answers 500 on purpose so Day Zero retries.
- `GET /dayzero/callback` (`app/dayzero/callback`): without a code it is the
  "Activate from your Day Zero account" screen, in the first HTML, 200. With
  `?code=` the page removes the code from the address bar and calls
  `POST /api/dayzero/claim`, which swaps the code at `/openid/token` (JSON body,
  `redirect_uri` = this origin + `/dayzero/callback`), reads
  `/openid/license_key` and continues only if `status` is `active`.
- Signed in: attach, Pro is on. Signed out: the license is held for an hour in
  an httpOnly, HMAC-signed cookie `urg_dz_license` (secret:
  `DAYZERO_CLIENT_SECRET`) plus a readable marker `urg_dz_pending=1`. "Create
  your account" goes to /onboarding, "I already have an account" to
  `/auth?next=/dayzero/callback`. `DayzeroClaimer` (mounted in AppShell) sees the
  marker once anyone is signed in and claims it; mid-onboarding it waits and
  shows the success screen after.
- One license, one account: attach only matches a row with no owner
  (`.is('user_id', null)`); a different owner gets "This license is on another
  account", and the license stays held so Switch account can finish it.
- `/dayzero` is on both sign-in safe lists and is a standalone page in AppShell.
- Table `dayzero_licenses` (migration `20261126120000_dayzero_licenses.sql`),
  RLS on, no policies, service role only. Until it is applied, the snapshot
  read fails quietly and nobody gains or loses anything.

## Env

`DAYZERO_CLIENT_ID`, `DAYZERO_CLIENT_SECRET`, `DAYZERO_API_KEY`,
`DAYZERO_ORIGIN` (defaults to https://dayzero.ltd). Never in the repo.

## Not verified

- Nothing has run against Day Zero: dayzero.ltd is not reachable from the build
  container, so the headers, the token call and the license call follow the
  founder's written spec. The wizard's green checks and "Run test activation"
  are the proof.
- Checked locally: a plain GET is 200 with the message in the HTML; a correctly
  signed test event is 200 `{success:true}`; a wrong signature is 401; every
  page state, light and dark, desktop and phone (claim API faked in the browser).
