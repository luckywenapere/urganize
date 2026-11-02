# Emerging: ₦4,000 a month, first month ₦2,500 (2026-11-02, v1.244.0)

Founder call, mock approved: `docs/mocks/emerging-offer/`.

**Prices.** Emerging (`solo`) `monthlyPrice` ₦4,000, `introMonthlyPrice` ₦2,500. Yearly is ten months: ₦40,000, no offer. Pro and Label unchanged, no offer. No team pays for Emerging yet, so nobody moves.

**One rule, reused.** The October starting-price machinery (`docs/notes/2026-10-26-starting-price.md`) does all of it. Only `INTRO_MONTHS` changed, 6 to 1: a team that has never paid gets one offer month; a team that paid before (at either price) gets none. `introThenLine` reads "for your first month, then ₦4,000/month".

**Screens.** urganize.app /pricing and the homepage strip show the full price struck through above the offer, with a "First month offer" tag on /pricing. The in-app `PlanCards` strike the full price too; `TierPlanPicker` and the charge note read "₦2,500 today, then ₦4,000 every month". Checkout: headline ₦2,500 a month, sub line "For your first month, then ₦4,000 a month."

**Needs the founder (Paystack, before card works for Emerging):**
- A ₦2,500 monthly Plan with `invoice_limit` 1, its code in `PAYSTACK_PLAN_SOLO_PER_MONTH_INTRO_NGN`.
- A ₦4,000 monthly Plan in `PAYSTACK_PLAN_SOLO_PER_MONTH_NGN` (the card is moved to it after the first payment by `switchToFullPrice`).
- A ₦40,000 yearly Plan in `PAYSTACK_PLAN_SOLO_PER_YEAR_NGN`.
- Until then the live price check refuses card for those; bank transfer works.
- The cancel flow's Emerging retention offers now read `PAYSTACK_PLAN_SOLO_RETENTION_2500` and `_3500` (bands follow the price); unset means the offer is hidden.

**Not verified** with a real card, transfer or webhook.
