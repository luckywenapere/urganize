# UrgAns credits: design

Decided 2026-10-01 (founder). Behind `NEXT_PUBLIC_FEATURE_URGANS_CREDITS`, default off.
This is the short design the spec asked for before the build. Most of the ledger
and metering was built first (v1.55.0); this records it, and names what is left.

## The rules

- 1 credit = $0.01, at a fixed N1,500 to the dollar, so a credit is about N15.
- A charge is 3x the provider's billed cost, from the tokens actually used,
  rounded up to whole credits, minimum 1 credit per chat turn. A failed call costs 0.
- Credits never expire and the balance never resets. Unused monthly allowance rolls over.
- Monthly allowance by plan: Solo 150, Manager 660, Label 1,500. Group is funded by hand.
- A 3 day trial gets 50 credits, once. If it ends with no plan and no top-up, what is
  left is removed. If either happened, it stays.
- Every plan can use every chat rung. Plans decide access; credits pay for each use.
- With the flag on, the credit balance REPLACES the 40/150 monthly chat limit and the
  daily embedded-action cap. With it off, both keep working unchanged.

## Ledger (built)

`credit_ledger`, append-only, one row per movement. Three tagged sources (pool):
`trial`, `allowance`, `topup`. Kinds: `trial`, `allowance`, `topup`, `spend`,
`adjust`, `refund`, `expire`. Signed `credits`, so the balance is a SQL sum
(`credit_balances(workspace)`, service role only), never a column two requests
could both write. Every grant carries a dedupe key, so it lands once
(`allowance:<workspace>:<window>`, `spend:<request>:<source>`). RLS on, no policies.

A spend draws trial first, then allowance, then top-up, so what is left of the trial
is exactly what a removal takes back. Each spend row stores the model, tokens in,
cached tokens and tokens out for the call (`metadata`), and the provider cost.

## Hold and settle (built)

- Chat: a turn does not start if the balance is below the hold for the model about
  to be used. It settles one row per source after a turn that succeeded.
- Embedded actions (rollout planner, press kit draft, pitch kit fill): the screen
  shows an estimate and the balance first (`embeddedCostLine`). The run holds up to
  25 credits (a check, not a reserved row, so nothing needs releasing), and settles at
  the real cost, never above the hold. A failed run is never charged. Approving a
  confirmation card is never charged.
- Refusals are 429, never 402 (the browser turns a 402 into a redirect to the paywall).
- Both doors onto the planner (the button and the chat) are metered.

## Screens

Built: the cost line with balance before each action; a low-balance banner below 50
credits; the credit history page at `/dashboard/credits` (every spend, top-up,
monthly grant and trial grant with date and amount), linked from Settings billing
and from the banner.

## Buying credits (built, flag-off)

Behind `NEXT_PUBLIC_FEATURE_CREDITS_PURCHASE` (default off, and only with credits on).
No new table: the ledger row is the record. Pack table: `lib/credits/packs.ts`.

1. `POST /api/credits/checkout { priceNaira }` (owner or admin of the team; an open
   route, so a lapsed team can still pay). The price must be one of the four packs.
   The credits come from the account's state at that moment (`creditsForPack`: a
   subscriber's rate, or the credits-only rate for a trial, an ended plan, or an
   account that cannot be read). A one-off Paystack transaction with no plan code,
   reference `urgcredits-<random>`, and the team, payer, price and credits in the
   metadata.
2. Settling (`settleCreditsPurchase`), from the signed webhook and from the page the
   buyer returns to, in either order, any number of times. It asks Paystack itself
   whether the transaction was paid, then `checkPurchase` compares it to the pack
   table: status success, NGN, the amount equal to the pack price to the kobo, and
   credits equal to one of that pack's two rates. A forged reference cannot pass.
   Then one `topup` ledger row with dedupe key `topup:<reference>`, so credits land
   once. Paid but the write failed: logged loudly and answered 500 so Paystack
   redelivers. A mismatch is logged and left for a person (redelivery cannot fix it).
3. The webhook diverts on the reference prefix before the generic handling, and neither
   it nor the verify route is behind the flag, so a pack that was paid for is credited
   even if purchasing is switched off afterwards.
4. `/dashboard/credits` shows the four packs, sized for the account, and the result when
   the buyer returns. iOS shows a line pointing to the browser instead (Apple's
   external payment rule). The out-of-credits notice and the low-balance banner say
   "buy" only when the flag is on (`isCreditsPurchasable`).
5. A purchase counts as a purchase for the trial rule: a trial that bought credits keeps
   its leftover trial credits.

Not built: a receipt email, a founder alert on purchase (a `credits_purchased` billing
event is written), and a reconcile sweep for a purchase whose webhook and callback both
never arrived.

## Left to decide: credits-only accounts

The spec says an account whose subscription ends keeps its credits and becomes
"credits-only" with Solo features. Today a lapsed or expired team meets the hard
wall and cannot reach chat at all, so a credits-only account has nowhere to spend
them. Making that work means changing who is walled, which is the most sensitive
rule in billing. It needs its own change, with the wall's tests, after purchasing.

## Not now

Auto top-up (later, opt-in, saved card at under 50 credits). Metering the status
update, task outcome and voice transcription.
