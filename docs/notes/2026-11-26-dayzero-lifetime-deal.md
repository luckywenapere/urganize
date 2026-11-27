# Day Zero lifetime deal (2026-11-26, v1.295.0, #1393, no flag)

Urganize is sold as a lifetime deal on Day Zero (dayzero.ltd), which works like
AppSumo Licensing v2: a signed webhook for license events, and an OAuth redirect
that brings the buyer back to claim the license. **One active license gives the
account it is attached to Solo Plus (code id `solo_plus`) for life** (founder
call, 2026-11-27, #1419), as the locked Day Zero deal page says: 1 artist, you
and 2 people helping you, 3 rollouts at a time, 400 AI credits a month. From
2026-11-26 (v1.295.0) to 2026-11-27 (v1.295.2) it gave Pro (`manager`); since
nothing is written to `subscriptions`, every license already attached moved to
Solo Plus with the deploy. Mocks: `docs/mocks/dayzero-activation/mock.html`
(they still say Pro).

## How the plan is granted

Nothing is written to `subscriptions`. `getSubscriptionSnapshot`
(`lib/subscription-access.ts`) also reads `dayzero_licenses` for an active
license on the user and folds it in with `applyLifetimeLicense`
(`lib/dayzero-shared.ts`): no plan, a trial, a lapse or Solo become paid on
`solo_plus` with `expiresAt: null` and `lifetime: true`; a paid plan at or above
Solo Plus (Solo Plus, Pro, Pro Plus, Label, Group, legacy, founding) is left
alone. The tier, limits and AI credits (400 a month, `monthlyAllowanceCredits`)
follow from the snapshot's plan. Every access decision (paywall, team access, tier,
credits allowance) already runs through the snapshot, so nothing else changed.
Why not a `subscriptions` row: a Paystack renewal upserts that row and would
overwrite the grant, and a refund would have to rebuild what was there before.

- **Refund** (`deactivate`): the license row goes to `deactivated`, so the
  snapshot stops folding it in and the team meets the plan wall like any team
  with no plan (founder call: the wall, not read-only). Their work is kept.
- **Distribution is not part of the grant.** The Distribute step and the TRM
  ledger read the owner's `subscriptions` row (`lib/distribution-team-server.ts`,
  `app/api/billing/distribution`), not the snapshot, so a lifetime account has
  no distribution under its plan and sends from its own TRM account, as it did
  on Pro. The deal page does not promise distribution. Including it would mean
  paying TRM for life on a one-off price. Oyin decided on 2026-11-27
  to leave distribution out.
- **Already paying by card**: the email says when the card plan is already
  at or above Solo Plus (Pro and up), since cancelling it would be a downgrade;
  ask the customer first. Otherwise Solo Plus is added and the founder gets a
  `dayzero_card_plan_cancel_needed` email (BILLING_ALERTS_EMAIL) to cancel the
  Paystack plan by hand. Nothing cancels it automatically (founder call).
- **Card trial abroad**: a lifetime account is never sent to `/add-card`.

## Pieces

- `POST /api/dayzero/webhook`: hex HMAC-SHA256 of `X-DayZero-Timestamp` + raw
  body with `DAYZERO_API_KEY`, timing-safe, else 401. `test: true` never touches
  the database. purchase creates an inactive row (never demotes one), activate
  sets active, deactivate sets deactivated; upgrade, downgrade and migrate move
  the owner from `prev_license_key` to the new key and deactivate the old one.
  A refund is final: once deactivated, no activate brings Solo Plus back (only an
  upgrade or migrate to a new key). Not ordered by timestamp, because a retried
  webhook may carry a fresh `event_timestamp` (Codex review on #1397). Answers 200 `{success, event}`; a database error
  answers 500 on purpose so Day Zero retries.
- `GET /dayzero/callback` (`app/dayzero/callback`): without a code it is the
  "Activate from your Day Zero account" screen, in the first HTML, 200. With
  `?code=` the page removes the code from the address bar and calls
  `POST /api/dayzero/claim`, which swaps the code at `/openid/token` (JSON body,
  `redirect_uri` = this origin + `/dayzero/callback`), reads
  `/openid/license_key` and continues only if `status` is `active`.
- Signed in: attach, Solo Plus is on. Signed out: the license is held for an hour in
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

## Verified in production (2026-11-26)

After v1.295.0 deployed, the Day Zero integration wizard
(dayzero.ltd/dashboard/integration) showed every step green:

- Both URLs saved and checked: `https://team.urganize.app/dayzero/callback`
  (plain GET, 200) and `https://team.urganize.app/api/dayzero/webhook`.
- The wizard's signed test `activate`, `deactivate` and `purchase` events each
  got 200 (13:57:42 WAT). The 404s before that (11:02) were from before the
  deploy.
- "Run test activation" passed (13:58:01 WAT). Day Zero sent a real `purchase`
  then `activate` for a test license (key starting `83667984`), both 200, and
  the redirect landed on "Pro is yours, for life" (founder saw it; the screen
  says "Solo Plus is yours, for life" since v1.295.2). That test license stays
  attached to the founder's account, which now gets Solo Plus from it (a paid
  plan at or above Solo Plus on that account wins).
- Go live is on: backers can activate.

Still not exercised for real: a refund (`deactivate` on a real license), the
signed-out path (cookie, then sign in or a new account), "another account",
and the card-plan email. Locally, a correctly signed test event was 200, a wrong
signature 401, and every page state was checked in light and dark, desktop and
phone.
