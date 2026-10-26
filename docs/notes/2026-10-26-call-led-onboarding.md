# Onboarding rules: only monthly Solo and Manager pay without a call (2026-10-26, v1.183.0)

Founder rules. Solo and Manager on the monthly plan are self-serve (pricing page, checkout, card or bank transfer, no call). Label, and every 6-month or yearly plan (Solo, Manager or Label), start with an onboarding call, and the founder sends the payment link after it. Nobody pays before the call. Yearly was added to the call-led side by the founder on 2026-10-26. Label is ₦100,000 a month (₦500,000 for 6 months, ₦1,000,000 a year); it was ₦60,000. Mock: `docs/mocks/onboarding-rules/index.html`.

**One rule, one place.** `isSelfServePurchase(tier, interval)` in `packages/pricing`. `lib/call-led.ts` (`needsOnboardingCall`) wraps it for the app.

**Where it bites.**
- `/pricing`: the card button reads "Book a call" for Label and every 6-month or yearly plan; it opens `/checkout?plan=&period=`.
- `/checkout` (`CallStep`): a call-led plan with no payment link shows "Book your onboarding call" (button to `NEXT_PUBLIC_ONBOARDING_CALL_URL`, else a mailto) and a "pay monthly instead" link. The wall's button reads "Book a call".
- Server: `POST /api/billing/start-checkout` and `POST /api/billing/transfer` answer 403 `call_required` unless `mayPay` (`lib/call-led-server.ts`) says yes. Yes means: self-serve plan, or an unused clearance for that email, plan and period, or a renewal of the plan and period the person already pays (so transfer renewals of a call-led plan still work). Fails closed.
- Admin `/admin/self-serve` "Send payment link": email, plan, period. Saves a `checkout_clearances` row and emails the `pay_link` template (with `planLine`) a link to `/checkout?plan=&period=&cleared=1`. `cleared=1` only shows the sign-up; the routes check the real row.
- After the payment clears, `completePaidSignup` stamps the clearance used and counts the team as concierge (approval source `admin`), not self-serve.

**Migration `20261026150000_checkout_clearances.sql`** (applied 2026-10-26): new table, RLS on, no policies, grants to service_role. No existing table touched, so no backup.

**Not built (mock showed more):** no call-status column or "mark call done". Bookings happen on the external page, so the app cannot know. The founder sends the link when ready.

**Needs the founder:** mint Paystack Plans at ₦100,000 / ₦500,000 / ₦1,000,000 for Label and point `PAYSTACK_PLAN_LABEL_PER_{MONTH,6_MONTHS,YEAR}_NGN` at them. Until then card payment for Label refuses (the price check, see self-serve note) and bank transfer works. Label retention Plans also changed bands (₦70,000 / ₦90,000). Set `NEXT_PUBLIC_ONBOARDING_CALL_URL` if not set.

**Not verified:** no real payment, link email or booking was exercised. Unit tests cover the rule, prices and form parsing; the routes and screens were type-checked only.
