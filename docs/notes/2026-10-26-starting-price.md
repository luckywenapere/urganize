# Starting price for the first 6 months (2026-10-26, v1.191.0)

Founder call. Mocks approved: `docs/mocks/pricing-starting-price/`.

**Prices.** Solo ₦5,000/month, Manager ₦30,000/month. A team paying for the first time pays the starting price for its first 6 monthly payments: Solo ₦4,000, Manager ₦26,000. It is still billed monthly. Yearly is 10 months' price (Solo ₦50,000, Manager ₦300,000) and gets no starting price. Label is contact-us: no price on any page, no checkout, WhatsApp button. Group is off the pages. The 6-month prepay is no longer sold (still a valid interval, so teams on it renew). Solo and Manager yearly are self-serve now (no call).

**Why these numbers.** Unit economics sheet "Urganize Unit Economics Model v1.0", Base: at the measured 1.5-month lifetime, nearly every paying team only pays starting-price months. 20% off both put self-serve Manager at 2.8x LTV:CAC. The chosen prices keep Solo at 4.3x and Manager at 3.1x. Manager's floor is about ₦25,400.

**One rule.** `introMonthsLeft` in `lib/intro-price.ts`: never paid → 6; paid before with some starting-price payments → what is left of 6 (holds across a gap); paid before at full price → 0. Prices: `introMonthlyPrice` on the tier, `getChargePrice(tier, interval, introMonthsLeft)` in `packages/pricing`. Server reader: `loadIntroMonthsLeft` in `lib/referrals-server.ts` (profiles.paid_at plus `subscription_charges.intro` rows).

**Card.** `start-checkout` applies `applyIntroPrice` once the paying owner is known, so it uses `PAYSTACK_PLAN_{SOLO,MANAGER}_PER_MONTH_INTRO_NGN` and the live Plan check runs on the starting price. The payment row carries `intro: true`, and the webhook records it on the charge. On a renewal billed on a starting-price Plan, the charge is marked intro; after the 6th, `switchToFullPrice` (`lib/intro-switch-server.ts`) starts a new Paystack subscription on the full Plan with the same card, first charged at the period end, saves the new code on our row, then disables the old one (in that order, because `subscription.disable` cancels whatever row holds the disabled code). Any failure emails the founder to swap by hand. Mint the starting-price Plans with `invoice_limit` 6 so a failed switch never bills a 7th cheap month.

**Transfer.** `openTransferInvoice` prices with the starting price while months are left; `applyTransferPeriod` marks the charge intro. Renewal reminder emails quote the next real amount.

**Screens.** /pricing and the homepage strip (starting price, "for your first 6 months, then ₦X/month", X-style feature lists from `tierFeatures`), the in-app wall and onboarding paywall (`TierPlanPicker`: Solo and Manager only, price lines, features, charge note), /checkout (headline and period chips). `introMonthsLeft` reaches the wall through `/api/subscription-status` and checkout through `/api/billing/self-serve`.

**Migration `20261026200000_intro_price_charges.sql`** (applied 2026-10-26): `subscription_charges.intro boolean not null default false` plus a partial index. Backup `subscription_charges_backup_20261026` (0 rows).

**Needs the founder:** mint the two starting-price Plans and set their env vars. Until then monthly card checkout is hidden for new teams; bank transfer works.

**Known gaps.** A plan change during the starting-price months is refused as a "grandfathered rate" (the team is paying less than list), so it goes to a conversation. Label teams can no longer pay by card; the founder records their payment. Not verified with a real card, transfer or webhook.

**Wall layout (v1.191.1, founder approved mock `docs/mocks/paywall-x-layout`, phone layout B).** When an owner can pay by card, the wall shows `PlanCards` (`components/billing/PlanCards.tsx`): a Monthly/Yearly switch, then one card per plan with name, price, the "for 6 months, then" line, its own button and its feature list, rows aligned across cards. Manager has the green border and the only filled button; on a phone the cards stack with Manager first. Yearly shows the monthly cost big and the yearly total under it. Label is a "Running a label? Talk to us on WhatsApp" line. iOS, the legacy picker and "nothing to buy" keep the old single card. `TierPlanPicker` stays for the onboarding paywall.
