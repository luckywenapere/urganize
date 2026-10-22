# Self-serve checkout: build notes

Anyone can sign up, pay for Solo or Manager (card or bank transfer, every plan and period) and start a first rollout without a founder call. Five sign-offs, in order. Nothing is pushed until Oyin approves the mocks, and no migration is applied until he says yes.

## 1. PM

**The job, in one line:** let a manager pay for Solo or Manager on their own, by card or bank transfer, and land on a guided first rollout, so a paying team costs no founder hours.

### What exists today (read, not rebuilt)

**The invite gate (URG-309).**
- `profiles.access_approved_at` + `profiles.access_source` (migration `20261015030000_closed_signup.sql`). `access_source` has no CHECK constraint, so a new value `paid_self_serve` needs no migration. A trigger stops a signed-in user writing either column.
- `lib/access-gate.ts` `decideAppAccess` (approved, then allowlist, then a foreign team membership, then an email invite). `lib/access-gate-server.ts` `approveUser(admin, userId, source)` is the one writer: first source wins, both caches invalidated, never throws.
- A held account is stopped in five places: the signed-out email check (`/api/access/check`, `InviteOnlyNotice`), the onboarding hand-off (`/locked?reason=not_approved`), every gated API (402 `not_approved`), workspace provisioning (`ensureOwnedWorkspace` throws `AccessNotApprovedError`, so no team and no trial), and the login bounce in `auth-store.ts`.
- `/locked?reason=not_approved` renders `HeldAccountScreen` ("You're on the list.") before any billing UI. **A held account can never reach a checkout today, and the Paystack webhook never approves anyone.** This is the core change.
- Invited teammates pass through `hasForeignMembership` (stamp `team_invite`). Unchanged: they never pay.
- `/admin/waitlist` "Let in" makes an `access_invites` row (`/start/<code>`); `/admin/access` approves held profiles.

**Billing.**
- `packages/pricing`: Solo ₦7,500, Manager ₦25,000, Label ₦60,000 a month (the brief said ₦8,000 for Solo; the code was repriced 2026-10-17, URG-349). Yearly = 10 months (`ANNUAL_MONTHS_BILLED`). Limits: Solo 1 artist, 2 seats, 1 active release, 150 credits; Manager 3 artists, 5 seats, 3 releases, 660 credits.
- **There is no 6-month interval** anywhere: not in `@urganize/pricing`, not in the `subscriptions_billing_interval_check` constraint, not in `advancePeriodEnd`.
- Card checkout: `POST /api/billing/start-checkout` (Paystack Plan subscription, plan codes `PAYSTACK_PLAN_{SOLO,MANAGER,LABEL}_PER_{MONTH,YEAR}_NGN`, `purchasableTiers()`). It uses `getAuthenticatedUser`, so it is not behind the gate; with no `workspaceId` the charge is credited to the user.
- Webhook `/api/webhooks/paystack`: HMAC-SHA512 signature check (`lib/paystack-signature.ts`). `charge.success` with a `payments` row runs `applyInitialOrManualCharge` (subscription upsert, `profiles.paid_at`). **Subscription charges have no event dedupe**, and the first-charge path recomputes `started_at` / `expires_at` on a redelivery. Pitch payments do dedupe (`payment_events`, unique `event, event_key`): reuse that pattern.
- `/payment/callback` polls `/api/payments/verify?reference=` every 1.5s for 30s. `/payment` is in auth-store's safe paths but not in `access-redirect.ts`'s.
- **No Dedicated Virtual Account, `bank_transfer` channel or `/customer` code exists.** Credits checkout (`/api/credits/checkout`, `settleCreditsPurchase`, verify-then-ledger keyed on the reference) is the best one-off pattern to copy.
- Promo: `promo_codes` give free days (not discounts). Partner codes (`referral_partners`, SOUNDWAVE) are commission tags (not discounts), behind `NEXT_PUBLIC_FEATURE_REFERRALS`.
- `/admin/teams` "Mark paid" cannot put a team on Solo, Manager or Label (`ADMIN_ASSIGNABLE_PLANS`). There is no admin audit table; `billing_events` is the ledger.
- `lib/entitlements.ts` `limitMessage` always says "Upgrade to Label" and `upgradeTo` is hardcoded to `label`.
- Plan change: `quotePlanChange` prorates card upgrades on 30 or 365 nominal days; the Paystack swap is still done by hand (`notifyFounder('plan_change_requested')`).

**Onboarding and Home.**
- Onboarding v2: 11 steps, account at step 7, then a paywall step that never charges (it saves a plan choice for `TeamWall`), welcome (step 9, "Talk to us" WhatsApp row), invite.
- Home is `HomeFour` (layouts `new`, `release`, `between`). `OnboardingBar` and `orderHomeBlocks` are dead code. A per-rollout "Your first steps" card (URG-293: date, cover, team; 14-day window) lives on the rollout page.
- Founder decision 2026-10-19: Home's top slot belongs to the one UrgAns suggestion card.

**Email.** `sendEmail` + registry; welcome and onboarding go from "Oyin at Urganize" `wenapere@urganize.app` (URG-325); the founder note signs "Wena". Onboarding sequence day 1/2/3/5/7, behind `EMAIL_ONBOARDING_SEQUENCE=on`, idempotent per step through `email_outbox.dedupe_key`. Daily send limit 100 (Resend free plan). New categories need a CHECK widening; this work reuses `onboarding` and `reminders`, so it needs none.

**Help.** HelpMenu: Report an issue (Linear), Docs, Contact us, Community. `/api/issue-reports` attaches team, plan, page and version server-side.

**Admin.** No week-2 metric exists; nearest is `admin-signup-return.ts`. Internal accounts: `internalAccountEmails()` + `withoutInternalAccounts`.

### Requirements (from the brief, made precise)

1. **Paying skips the waitlist.** On a verified `charge.success` (card, DVA or one-time transfer) for a self-serve Solo, Manager or Label purchase, call `approveUser(admin, userId, 'paid_self_serve')`. Then provision the workspace so the team exists before the buyer lands. Free and trial sign-ups stay on the waitlist exactly as today. Email confirmation stays on.
2. **One path.** `/pricing` card "Get Solo" / "Get Manager" → `app.urganize.app/checkout?plan=manager&period=monthly` → if signed out, a short sign-up on the same page (Google, or email + confirm) carrying the plan → checkout → welcome (once) → Home → first rollout with the AI plan → a gentle teammate invite.
   - The plan rides in a new checkout intent (localStorage, 30 days) **and** `user_metadata.pending_checkout` so an email confirmed on another device still returns to checkout.
   - The paid path skips the long onboarding questions; the planner intake asks what the first plan needs.
3. **No dead ends.** A signed-in held account that started the paid path (checkout intent or `pending_checkout`) sees "Finish setting up" (one action, back to checkout) instead of "You're on the list.". Anyone else held still sees the waitlist screen.
4. **Checkout screen.** One screen: plan, period, a live "You get" line (seats, artists, UrgAns credits; "Distribution included" once that flag is on), optional promo code, total in naira, and one action "Pay ₦X". Card and bank transfer side by side on every plan and period.
   - **Card:** the existing Paystack subscription that auto-renews.
   - **Bank transfer:** a Paystack Dedicated Virtual Account per paying team, in Urganize's name, shown with the exact amount and a copy button; reused for every renewal. Falls back to Paystack's one-time `bank_transfer` channel when `PAYSTACK_DVA_ENABLED` is not `true`.
   - No screenshot or transaction-ID upload, ever. Access opens only from a verified Paystack event.
   - Periods: monthly and yearly from `@urganize/pricing`; each hidden when its Paystack env var is missing.
5. **Concierge fallback.** Admin "Record transfer" for money that reached Urganize's own bank account outside Paystack: team, amount, date, bank reference, plan, period. Sets the period end, approves the owner (source `admin`), stamps `payment_method = 'direct_transfer'`, writes a `billing_events` row (`direct_transfer_recorded`, actor = the admin). Counted in partner commission and cohort maths.
6. **Transfer-paid periods don't renew by themselves.** Reminder email + in-app banner at 7, 3 and 1 days before the end, each with one "Renew" action that opens the same checkout. At the end, the normal lapse rules apply (paid before, so read-only, not the wall).
7. **Setup call.** "Book a 15-minute setup call" on the welcome screen and in Help, Manager and Label only, URL from `ONBOARDING_CALL_URL`; hidden when unset.
8. **First 14 days checklist on Home** (all new teams): create your first rollout; finish 3 tasks; invite one teammate (Manager and Label only); add cover art and details; unlock distribution (only behind the distribution-included flag). Each item deep-links. Hides when done or dismissed. No AI, no credits.
9. **Nudges.** Day 1, 3 and 7 emails from the existing founder sender, each only when its checklist step is not done, one action each, unsubscribable (`onboarding` category).
10. **Solo guardrail.** Limits stated on `/pricing` and checkout; enforced on the server (already is). At a limit: one action "Upgrade to Manager" opening the same checkout, credited for the time left.
11. **Help widget.** Topic chips first (Billing, Rollouts, Distribution, Account, Other), then a message box. Team, plan, page and app version attached automatically. Sent to `wenapere@urganize.app` (and stored like an issue report). Topic logged to PostHog.
12. **Measure by path.** `workspaces.acquisition_path` (`self_serve` | `concierge` | `legacy`), `workspaces.payment_method` (`card` | `transfer` | `direct_transfer`), `workspaces.founder_minutes` (optional, typed in admin). An admin cohort card: self-serve vs concierge, split by plan and payment method: sign-ups, paid conversion, week-2 active (one or more task actions in days 8 to 14), median founder minutes per paying team. Internal accounts excluded.
13. **Database:** additive only (new nullable columns, new tables). Written, not applied, until Oyin says yes; backup or PITR timestamp noted first.

### Acceptance criteria

- A signed-out visitor taps "Get Manager", signs up with Google, pays by card, and lands on the welcome screen as an approved team with a Manager subscription, never seeing "You're on the list.".
- The same by email: CheckInbox, the confirm link (also on another device) returns to checkout with Manager monthly still chosen.
- Paying by transfer: the team's account number appears with the exact amount; a Paystack DVA `charge.success` for that amount approves the owner and starts the period; the next renewal to the same number extends it.
- No client redirect, query parameter or poll ever approves anyone. Only a signature-verified webhook (or the server-side verify of a reference we created) does.
- A free sign-up with no invite still sees the waitlist, exactly as today.
- Every new table has RLS on, no policies, and explicit grants (service role only).

### Edge cases

| Case | What happens |
|---|---|
| Card paid, webhook late | Callback polls verify; verify also asks Paystack (`/transaction/verify`) for a reference we created and settles through the same idempotent function. Approval is first-writer-wins; a second settle changes nothing. |
| Webhook replayed | Dedupe on `event + reference` (`payment_events` pattern). The period is set once, never recomputed. |
| Payment fails or is abandoned | Payments row stays `pending` / `failed`; the account stays held; next visit shows "Finish setting up". |
| Already on the waitlist, then pays | Approved; Neon waitlist row set to `converted` (best effort, as admin "Let in" does). |
| Teammate invited by a paying owner | No payment; passes as today through membership. |
| Existing trial team upgrades | Same checkout, credited to the team owner (`workspaceId`). Already approved, so no approval change. `acquisition_path` stays as it was. |
| Refund or chargeback | `refund.processed` / `charge.dispute.create` write a `billing_events` row and a "Refunded" / "Disputed" badge in `/admin/teams`. Access is not revoked automatically. |
| Transfer under the amount | DVA: the invoice stays open, no access, banner "₦X still to pay". One-time channel: Paystack's own outcome (it rejects or reverses a mismatch); we show what Paystack reports. Never approve on a partial. |
| Transfer over the amount | Access granted; the extra becomes a transfer credit taken off the next renewal. |
| Transfer after the checkout session expired | DVA: the account never expires, so it matches the team's open invoice; if no invoice is open, it opens a new one for the last chosen plan and period. One-time channel: Paystack's outcome. |
| Invalid or expired promo | Inline "That code doesn't work." Total unchanged; payment still possible. |
| Solo hits its artist limit, upgrades mid-period | Card: existing `quotePlanChange` proration. Transfer: the unused Solo days are credited against the Manager amount. |
| Transfer-paid period ends with no renewal | 7/3/1 reminders sent; then read-only (paid before), with Renew. |

### Amendment (Oyin, Oct 22): Manager goes to ₦30,000

Overrides "price changes are out of scope" for Manager only.

- **The real starting price is ₦25,000, not ₦26,000.** `origin/main` sells Manager at `tierPrice(25_000)` (repriced 2026-10-17), and nothing in the repo says ₦26,000. So the change is ₦25,000 → **₦30,000 a month**. No Manager customer has paid, so no grandfathering.
- **One edit:** `PRICING_TIERS.manager.monthlyPrice` in `packages/pricing`. Everything else reads it.
- **6-month prepay becomes real, as "6-for-5":** a new `SIX_MONTHS_BILLED = 5` beside `ANNUAL_MONTHS_BILLED = 10`, and a `semiannual` interval. Manager: ₦30,000 / ₦150,000 / ₦300,000. Applied to every tier by the same rule (Solo ₦40,000, Label ₦300,000 for 6 months), each still hidden until its Paystack env var is set.
- **The one schema change that is not purely additive:** `subscriptions_billing_interval_check` and `subscriptions_pending_billing_interval_check` allow only `monthly` and `annual`. Selling 6 months means widening both to add `semiannual` (drop and re-add the CHECK with one more value; no data changes). Needs Oyin's yes like the other migrations.
- **Hard-coded old prices to replace with the constant:** `apps/docs/account/subscription.mdx` (table: ₦25,000 / ₦250,000), `apps/web/.env.example:1395` (comment), `components/billing/TierPlanPicker.tsx:138` (comment), `lib/cancel-flow.ts:347` (comment), `lib/credits/allowance.ts:23` (comment). Tests that assert the old price: `billing-plans.test.ts` (325, 328, 429, 476), `entitlements.test.ts` (228, 237, 240), `cancel-flow.test.ts` (233-271). The front-desk ₦25,000 values are a curator's sample fee, not our price: left alone. The marketing pricing cards, checkout and wall already read the constant.
- **Cancel-flow budget bands move by themselves** (they are fractions of the price): Manager becomes ₦14,000 / ₦20,000 / ₦27,000. The two Manager retention Plans named after the old bands (`PAYSTACK_PLAN_MANAGER_RETENTION_17000` / `_23000`) no longer match, so those two offers hide until new retention Plans exist. That is the code's existing "missing = hidden" rule, not a break.
- **Vercel env vars Oyin sets (Production), after minting the Plans himself in Paystack:**
  - `PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN` → new Plan, ₦30,000, interval monthly (replace the value)
  - `PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN` → new Plan, ₦300,000, interval annually (replace the value)
  - `PAYSTACK_PLAN_MANAGER_PER_6_MONTHS_NGN` → new Plan, ₦150,000, interval biannually (new variable)
  - optional, only to sell 6 months on Solo and Label too: `PAYSTACK_PLAN_SOLO_PER_6_MONTHS_NGN` (₦40,000) and `PAYSTACK_PLAN_LABEL_PER_6_MONTHS_NGN` (₦300,000)
  - optional, to bring the two Manager retention offers back: `PAYSTACK_PLAN_MANAGER_RETENTION_20000` and `_27000` (monthly Plans at those prices)
  - The old Manager Plans stay in Paystack untouched. I do not create or edit live Plans.
- Transfer payments need no Plan code: the amount comes straight from `@urganize/pricing`. A period is offered for transfer whenever its price exists, and for card only when its env var is set.

### Out of scope

Changing other prices, free-plan self-serve, a referral programme, a new onboarding quiz, crypto, screenshot-verified transfers, percentage discounts (a promo code here is a partner tag or free days, the two kinds that exist).

### Questions for Oyin (answer with the mocks)

1. **6-month prepay, and the CHECK widening it needs.** Settled by the amendment (6-for-5). The open part: widening the two interval CHECK constraints to allow `semiannual`. Recommendation: yes, it changes no data. **Answered Oct 22: yes.** The migration goes in with the build and is applied to production only after the mocks are approved and a backup point is noted.
2. **Solo price.** Answered Oct 22: Solo goes to ₦8,000 (see "Second amendment" below). Manager is ₦25,000 today, not ₦26,000; going to ₦30,000 per the amendment.
3. **Paystack dashboard (before ship):** ask Paystack to enable Dedicated Virtual Accounts on the live business (they approve it per business; preferred bank Wema or Titan), and confirm the "Bank Transfer" channel is on for checkout. Set `PAYSTACK_DVA_ENABLED=true` and `PAYSTACK_DVA_BANK` (`wema-bank` or `titan-paystack`) only once approved. Until then transfer uses the one-time channel.
4. **ONBOARDING_CALL_URL:** answered Oct 22: `https://call.urganize.app`. Set it in Vercel Production (project `urganize`) before the push.

### Linear

Could not file: Linear answered "You've exceeded the free issue limit for this workspace" (Oct 22, 2026, the same wall the Altlink pilot hit). Commits will say "Self-serve checkout" until an issue exists. To unblock: archive old Done issues or upgrade Linear, then I file it and name it in the commit.

**PM sign-off.** Scope, edge cases and the four questions above. Next: design. No code until the mocks are approved.

### Second amendment (Oyin, Oct 22, 2026): Solo ₦7,500 → ₦8,000

- Solo goes to **₦8,000 a month**, effective now, changed only in `@urganize/pricing`. Derived: 6 months ₦40,000 (6-for-5), yearly ₦80,000 (10-for-12). Limits unchanged.
- Vercel env vars (Production, project `urganize`), Plans minted by Oyin, not by me:
  - `PAYSTACK_PLAN_SOLO_PER_MONTH_NGN` → a ₦8,000 monthly Plan (replace)
  - `PAYSTACK_PLAN_SOLO_PER_YEAR_NGN` → a ₦80,000 annually Plan (replace)
  - `PAYSTACK_PLAN_SOLO_PER_6_MONTHS_NGN` → a ₦40,000 biannually Plan (new; optional, 6 months on Solo stays hidden until it is set)
- **Existing Solo subscribers keep their ₦7,500** (Paystack binds a subscription to its Plan); only new purchases see ₦8,000. Say if you want them moved.
- Hardcoded ₦7,500 to update with the code: `apps/docs/account/subscription.mdx` table, `apps/web/.env.example` comment, comments in `lib/cancel-flow.ts`, `lib/credits/allowance.ts`, `lib/referral-credits.ts`, `packages/pricing/src/index.ts`; tests `billing-plans.test.ts:324`, `entitlements.test.ts:236`, `cancel-flow.test.ts` (Solo bands and the "Switch to Solo" label). The ₦7,500 credit pack (`lib/credits/packs.ts`) is a different thing and stays.
- Cancel-flow budget bands for Solo are recomputed from ₦8,000; the Solo retention Plans (`_SOLO_RETENTION_5000` / `_7000`) no longer match the new bands, so those offers hide until new codes are set.

---

## Designer

Mocks: `docs/mocks/self-serve-manager/` (source `mock.html?s=<screen>`, PNGs `<screen>-phone.png` at 390px and `<screen>-desktop.png` at 1440px; `phone.html` renders the 390px frame). Dark app tokens and Young Serif / Instrument Sans / Space Mono from `globals.css`; the public pricing page uses the marketing site's light palette.

| # | Screen | Files |
|---|---|---|
| 0 | Admin: Record a transfer | `admin-record` |
| 1 | /pricing at ₦30,000 | `pricing` |
| 1b | Checkout, card, monthly ₦30,000 | `checkout-card` |
| 1b | Checkout, transfer, 6 months ₦150,000, code applied | `checkout-transfer` |
| 1b | Transfer: your account number | `transfer-waiting` |
| 1b | Transfer: part paid | `transfer-partpaid` |
| 2 | Sign-up with the plan carried; check your email | `signup`, `check-inbox` |
| 3 | Back from payment: success, confirming, failed | `pay-success`, `pay-pending`, `pay-failed` |
| 4 | Finish setting up | `finish` |
| 5 | Welcome | `welcome` |
| 6 | Home: first 14 days, in progress and done | `home-checklist`, `home-checklist-done` |
| 7 | Nudge emails, day 1 / 3 / 7 | `email-day1`, `email-day3`, `email-day7` |
| 8 | Admin cohort card and founder minutes | `admin-cohort` |
| 9 | Renewal banner and email | `renewal-banner`, `renewal-email` |
| 10 | Solo limit, Upgrade to Manager | `solo-limit` |
| 11 | Help with topic chips | `help` |

Choices:
- One green button per screen, named for what it does: "Pay ₦30,000", "Get my account number", "Copy account number", "Start your first rollout", "Upgrade to Manager", "Record transfer". Home keeps its existing "One thing" card as the only green; the checklist has none.
- Checkout is amount-first: the price is the headline, the period switch shows all three totals, "You get" is four lines. Card and Bank transfer are the same size, side by side. The code field is hidden behind "Have a code?".
- The transfer screen leads with the amount and the account number, with copy buttons on both, and says the number is theirs for renewals. No upload, no "we'll check".
- Pricing keeps the uniform black CTAs (founder call, Sep 11). Each card states its limit in a white box above the button, so Solo's cap is read before buying.
- The setup call is a quiet text button on Welcome and Help, never a second green.
- Emails use the founder-note register (white, plain, one button), signed Wena, from "Oyin at Urganize". Each mock names the day and the condition it is sent on.
- Admin cohort shows counts with the rate beside them, so 12 of 41 reads before 29%.

**Designer sign-off.** Mocks ready for Oyin. Stopping here: no feature code until he says yes.

Oyin approved the mocks on Oct 22, 2026, and said yes to the 6-month CHECK widening.

## Staff Engineer

Built as mocked. Full record: `docs/notes/2026-10-22-self-serve-checkout.md`. The decisions worth knowing:
- **One rule lets people in:** a verified payment (webhook-checked card or dedicated-account transfer, or an admin-recorded transfer). `completePaidSignup` approves the account with source `paid_self_serve` (`admin` for a recorded transfer, which counts as concierge in the cohort).
- **Card checkout reads the live Paystack Plan first** and refuses (409, "Card payment for this plan isn't ready yet...") unless it charges exactly the shown price. Added after the build because the monthly and yearly Plan env vars still point at the old Plans until new ones are minted; without it the first buyer would have been charged ₦25,000 for "₦30,000". Bank transfer prices from our own table and keeps working.
- Transfers: one dedicated account per payer, reused for renewals; `payment_transfers` is unique on the Paystack reference, so a webhook sent twice records once; a part payment shows "part paid" and never opens the team.
- Emails (nudges day 1 / 3 / 7, renewal reminders 7 / 3 / 1): a `lifecycle_sends` row is the lock, written before sending, inside the day's email budget, never retried.
- The checklist and nudges are for self-serve teams only; concierge and legacy teams see nothing new.
- Help sends to wenapere@urganize.app with reply-to the user and the team, plan and page attached; the old mailto is gone.
- Promo codes go through `lookupReferralCode` in `lib/referrals-server.ts` (the referral tables keep one reader).
- New tables: RLS on, no policies, explicit grants. No new feature flag.

**Engineer sign-off.** Type-check clean, lint adds nothing (warnings match the files' existing ones), `next build` green with `/auth`, `/onboarding`, `/settings`, `/dashboard`, `/dashboard/home`, `/locked`, `/checkout` and `/admin/self-serve` static.

## QA

- Unit tests: `lib/self-serve.test.ts` (rules, copy, help form, setup call), `lib/admin-self-serve-cohort.test.ts`, `lib/paystack-plan-check.test.ts`, Solo-limit messages in `lib/entitlements.test.ts`, plus updated billing, cancel-flow, email and admin-section tests.
- Guards kept: referral tables have one reader, the referral reward has a known caller list (transfer is the third payment path), only internal founder mail opts out of socials, copy rules (no em dashes, "rollout").
- Full suite: every failure left is one that also fails on main before this change (19, unrelated: voice guards, programme seeds, rollout-vocabulary on pricing's "Unlimited releases", and others).
- **Not verified:** no real card or transfer, no webhook delivery, no email sent, nothing seen in a browser with a real session. First real check after deploy: buy Manager monthly with a real card once the new Plan is minted.

**QA sign-off.** Ready to ship, with the Paystack Plans as the one founder step before card checkout opens.

## Growth

- Measured: `pricing_plan_clicked` (plan, period) on the site; checkout start, payment method, payment confirmed and welcome reached in the app; `help_topic_selected`, `setup_call_clicked`; nudge and renewal emails log their send and the click (`/api/lifecycle/click`).
- The question to answer in two weeks: of teams that paid at checkout, how many are active in week 2, and how many founder minutes did each cost against concierge teams. `/admin/self-serve` shows both side by side.
- Copy follows the rules: no "start free" or "sign up now", "Pay by bank transfer", "rollout", no em dashes.

**Growth sign-off.** Ship. Watch the cohort card weekly.
