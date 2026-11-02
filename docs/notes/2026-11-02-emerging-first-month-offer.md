# First month offer: Emerging ₦4,000 (first month ₦2,600), Pro ₦40,000 (first month ₦24,000) (2026-11-02, v1.244.0)

Founder call, mock approved: `docs/mocks/emerging-offer/`.

**Prices.** Emerging (`solo`) `monthlyPrice` ₦4,000, `introMonthlyPrice` ₦2,600. Pro (`manager`) `monthlyPrice` ₦40,000, `introMonthlyPrice` ₦24,000 (founder, same day). Yearly is ten months, no offer: ₦40,000 and ₦400,000. Label unchanged, no offer. No team pays for Emerging or Pro yet, so nobody moves. Pro's TRM fee (₦7,100 a month) is still covered by the ₦24,000 first month.

**One rule, reused.** The October starting-price machinery (`docs/notes/2026-10-26-starting-price.md`) does all of it. Only `INTRO_MONTHS` changed, 6 to 1: a team that has never paid gets one offer month; a team that paid before (at either price) gets none. `introThenLine` reads "for your first month, then ₦4,000/month".

**The switch to ₦4,000 runs on the first charge.** The October code switched only on a renewal, which a one-payment Plan never makes (Codex on #1049). Now the Paystack webhook's initial path calls `switchToFullPrice` when the charge was intro and no offer months are left: a new subscription on the ₦4,000 Plan, same card, first charged when the paid month ends. `handleSubscriptionCreate` ignores a later starting-price `subscription.create` when the row already holds a different code, so it cannot put the team back on the spent Plan. If the switch fails the founder is emailed to do it by hand. Guarded by `lib/intro-switch-guard.test.ts`.

**Once only, and no stale code (Codex on #1050).** The payments row claims the switch: `paystack_response.intro_switch` is set to `started` only where it is empty, then to the new subscription code (or `failed`). A redelivered first charge sees the code and only re-stamps it and the price (`stampFullPrice`), since the initial upsert just overwrote them; it never starts a second subscription. A starting-price `subscription.create` is one conditional update (row code empty or equal), so an overlapping charge cannot slip between a read and the write. `stampFullPrice` also sets `price_locked_kobo` to the full price, so the team is not read as on a grandfathered starting price and refused plan changes.

**Screens.** urganize.app /pricing and the homepage strip show the full price struck through above the offer, with a "First month offer" tag on /pricing. The in-app `PlanCards` strike the full price too; `TierPlanPicker` and the charge note read "₦2,600 today, then ₦4,000 every month". Checkout: headline ₦2,600 a month, sub line "For your first month, then ₦4,000 a month."

**Needs the founder (Paystack, before card works for Emerging):**
- A ₦2,600 monthly Plan with `invoice_limit` 1, its code in `PAYSTACK_PLAN_SOLO_PER_MONTH_INTRO_NGN`.
- A ₦4,000 monthly Plan in `PAYSTACK_PLAN_SOLO_PER_MONTH_NGN` (the card is moved to it after the first payment by `switchToFullPrice`).
- A ₦40,000 yearly Plan in `PAYSTACK_PLAN_SOLO_PER_YEAR_NGN`.
- Pro: ₦24,000 monthly (`invoice_limit` 1) in `PAYSTACK_PLAN_MANAGER_PER_MONTH_INTRO_NGN`, ₦40,000 monthly in `PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN`, ₦400,000 yearly in `PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN`.
- Until then the live price check refuses card for those; bank transfer works.
- The cancel flow's retention offers follow the price: Emerging `PAYSTACK_PLAN_SOLO_RETENTION_2500` / `_3500`, Pro `PAYSTACK_PLAN_MANAGER_RETENTION_25000` / `_35000`; unset means the offer is hidden.

**Not verified** with a real card, transfer or webhook.
