# Dollar prices outside Nigeria (2026-11-08, v1.256.0, #1120)

Decided with Oyin on #1112 (comment 6712500705) and approved from the mock at
`docs/mocks/usd-pricing/mock.html`.

## What it is

- One price in US dollars for every country outside Nigeria. Nigeria keeps
  Naira and Paystack.
- Solo $9, Manager $29, Pro $79 a month. A year is ten months ($90, $290,
  $790). No starting price in dollars.
- Label shows **Custom** and "Talk to us", with no price, in Naira AND dollars.
  It said "From ₦100,000/month" before. Group reads Custom too.
- More AI credits: 100 for $2 outside Nigeria ($2, $4, $10, $20 for the four
  packs). Same credits per pack as Naira.
- A single to stores: $1.50 (TRM's public price is the ceiling under our
  agreement).

## How it decides who sees dollars

- `pricingCurrencyForCountry` (packages/pricing): NG or unknown is Naira, any
  other real country code is USD.
- In the app, `payerCurrency` (lib/bachs.ts) also requires Bachs to be
  configured, so we never show a price we cannot charge. `/api/subscription-status`
  and `/api/billing/self-serve` return `currency`; signed-out screens ask the
  open `GET /api/billing/currency` through `useVisitorCurrency`.
- The marketing site is still a static page. It asks its own
  `GET /api/currency` after load and swaps to dollars (`VisitorPrice` for the
  server-rendered homepage strip).

## How the money is checked

- Bachs is asked to charge USD (`pricing.currency = 'USD'`, amount in cents as
  a decimal string).
- `bachs_checkouts` (migration `20261107180000_bachs_checkouts_currency.sql`,
  applied 2026-11-08, backup `bachs_checkouts_backup_20261108`) gained
  `currency`, `amount_minor` (cents or kobo, what Bachs was asked), and for
  credit packs `purpose = 'credits'`, `credits`, `pack_price_naira`,
  `owner_user_id`. `plan` and `billing_interval` are nullable only for credits
  rows (a check keeps plan rows strict).
- `remoteCheckoutIsPaid` matches currency AND amount_minor. A dollar row paid
  in Naira, or the right number in the wrong unit, is not paid.
- **Our books stay in kobo.** `amount_kobo` on a dollar row, and everything it
  writes (subscriptions.amount, charges, margins), is the Naira equivalent at
  `NAIRA_PER_DOLLAR` (1,500). That rate never sets a price.
- A consequence worth knowing: a dollar subscriber's `subscriptions.amount` is
  not a Naira list price, so `isGrandfatheredRate` reads them as grandfathered
  and plan changes go to a person. Safe, and on purpose for now.
- Credit packs: `/api/credits/checkout` sends a dollar buyer to Bachs
  (`startBachsCreditsCheckout`), with a `urgcredits-` reference so the return
  page's verify call works. `fulfilBachsCheckout` credits through
  `creditPurchase` (source `bachs`) after Bachs confirms the dollars; if the
  ledger write fails the row goes back to open so the next webhook or poll
  retries.
- Renewal reminders: a team whose last plan payment was in dollars is reminded
  in dollars and sent to checkout, not to a bank transfer.

## Not done yet

- **Auto-renew on dollar cards** (Bachs subscriptions: products, `invoice.paid`
  webhooks, cancel). A dollar payment covers one month or one year and we
  remind them before it ends, like today's Bachs payments. Next PR.
- Mobile money is not listed as a way to pay on a dollar checkout until we see
  Bachs offer it there in the sandbox.
- `selfServeLimitMessage` (lib/entitlements.ts) still names the next plan's
  price in Naira.
- The FAQ's single price on urganize.app is still Naira (static content).
- Nothing has been paid in dollars for real yet: no sandbox key on this
  machine.
