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

## Left to build: buying credits

Nothing sells credits yet, and `CREDITS_PURCHASABLE` stays false, so no line tells
anyone to buy. The pack table is in `lib/credits/packs.ts`.

1. `POST /api/credits/checkout { priceNaira }`: reject any price not in
   `TOPUP_PACKS`; decide the credits on the server from the account's state at that
   moment (`creditsForPack`); initialize a one-off Paystack transaction (no plan code)
   with a `urgcredits-` reference prefix; store the reference, price and credits on a
   `payments` row so the webhook never trusts the client.
2. Webhook: divert on the reference prefix before the generic branch (the
   `urgpitch-` and trial-card precedent). On `charge.success`, claim the payments row by
   compare-and-set, then `adjustCredits`-style insert of a `topup` row with dedupe key
   `topup:<reference>` so a redelivered webhook credits once. The amount credited is the
   stored one.
3. A buy screen on the history page, and the out-of-credits notice and the chat
   fallback prompt switch to buying wording when `CREDITS_PURCHASABLE` becomes true.
4. iOS hides the buy surface (Apple's external payment rule), as with pitch payments.

## Left to decide: credits-only accounts

The spec says an account whose subscription ends keeps its credits and becomes
"credits-only" with Solo features. Today a lapsed or expired team meets the hard
wall and cannot reach chat at all, so a credits-only account has nowhere to spend
them. Making that work means changing who is walled, which is the most sensitive
rule in billing. It needs its own change, with the wall's tests, after purchasing.

## Not now

Auto top-up (later, opt-in, saved card at under 50 credits). Metering the status
update, task outcome and voice transcription.
