# UrgAns credits (2026-10-01, built flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask: work out what an AI action really costs so a credits system can charge for it, so that "no one will be able to run anything without properly paying for the actual credits and cost they will incur". Not a scope expansion: it meters the already-sanctioned assistant and its embedded actions. Behind `NEXT_PUBLIC_FEATURE_URGANS_CREDITS` (default off). Migrations `20261001120000_credit_ledger.sql` (**applied in production by the founder**) and `20261001130000_credit_ledger_sources.sql` (the follow-up that reshapes it for the rules below, **not applied yet**). The founder confirmed the rules in two rounds on 2026-10-01; this section is the record of both.

**Metered:** chat turns, and the two embedded actions (the rollout planner, a press-kit draft). **Not metered yet:** the status update, task outcome and voice transcription. **There is no way to buy credits yet:** the pack table exists (`lib/credits/packs.ts`) and nothing sells it; an admin grants credits by hand.

### The rules (founder, 2026-10-01)

- **1 credit = $0.01.** The exchange rate is fixed at 1,500 naira to the dollar, so a credit is about 15 naira.
- **A charge is 3x the provider's billed cost**, from the tokens actually used, rounded up to whole credits, **minimum 1 credit per turn**. Failed calls cost 0.
- **Credits never expire and the balance never resets.** Unused monthly allowance rolls over. When a subscription ends (cancelled or lapsed) the whole remaining balance stays, allowance and bought credits alike, and the account drops to Solo features as a **credits-only** account that pays double for top-ups until it subscribes again.
- **Monthly allowance by plan:** Solo 150, Manager 660, Label 1,500. Group is custom, so it is given credits by hand through the admin route.
- **Trials (3 days) get 50 credits, once.** If the trial ends with no plan bought and no top-up bought, what is left is removed. If either happened, the leftovers stay.
- **Every plan can use every rung** of the model ladder.
- **At 0 credits** the assistant falls back to typed-command mode with a notice (buying wording stays off until purchasing exists, see `CREDITS_PURCHASABLE`).
- **Top-up packs** (same naira for everyone, credits differ by account): 1,500 naira buys 100 (subscriber) or 50 (credits-only), 3,000 buys 200 or 100, 7,500 buys 500 or 250, 15,000 buys 1,000 or 500. Paystack only, no custom amounts.
- **Embedded actions are metered with no flat price:** billed on actual tokens at the same 3x, an estimate is shown first (planner about 12 credits; the press-kit draft shows the hold), a **hold of up to 25 credits** is placed, the run settles at its real cost and **never above the hold**, the rest is released. The press-kit draft uses the same 25 until it has its own estimate. Every run stores its model, input, cached and output tokens so flat prices can be decided later from real runs. This replaced "flat credit price per run once measured".

### How it works

- **`lib/credits/`** is the money maths, pure and tested: `model-prices.ts` (the provider's per-model prices in RODI, copied from the public catalogue on 2026-10-01), `pricing.ts` (cost of a call, credits for a cost, a turn's charge, the hold, the naira rates), `allowance.ts` (the sources, what each plan grants, who is a subscriber, how a charge splits), `embedded.ts` (the hold, the estimates, the capped charge, the usage collector and summary), `packs.ts` (the table above), `copy.ts` (what people read), `config.ts` (the flag). `credits-server.ts` and `embedded-server.ts` are the ledger reads and writes.
- **A charge is worked out from the tokens a run really used.** The chat runner reports every gateway call (`ChappiAgentResult.usageCalls`); the provider layer now reports the **model and cached tokens** on every call too (`AiUsage`), and each embedded action collects ALL of them (retries and router hops included, since each was billed) with `createUsageCollector`. Cached tokens matter a great deal: a cached prompt token costs 10% of a fresh one on the GPT-5 models, so the same turn costs about 5x more cold than warm.
- **One balance, three tagged sources in one append-only ledger** (`credit_ledger`): `trial`, `allowance`, `topup`. Every grant and every spend is tagged, which is what lets leftover trial credits be removed without touching anything else. A turn draws **trial first, then allowance, then top-up**, so what is left of the trial is exactly what a removal takes. The balance is a SQL sum over all time (`credit_balances(workspace)`, service role only), never a column two requests could both write. The monthly grant is deduplicated per billing window (`allowance:<workspace>:<window>`), so it adds to the balance once a window.
- **Who gets what** (`creditAccount`, read from `state`, never `tier` alone): `trial` (and the short grace) gets the one-off 50; `subscriber` (paid or comped) gets the monthly allowance; anything else is `credits_only` and gets nothing new. A comped team gets the Solo amount and so does a paid team on a plan the code does not recognise (the founder set no number for either).
- **The trial removal is lazy, in `getCreditSnapshot`**: when a team is `walled` with trial credits left and `hasEverPurchased` says no (the owner's `profiles.paid_at` is empty and no ledger row of kind `topup`), one `expire` row takes back exactly what is left. It fails toward KEEPING: any read that cannot be established means nothing is taken.
- **Chat route** (`/api/urgans`): with the flag on, credits REPLACE the 40/150 monthly action ceiling. It refuses to START a turn if the balance is below the hold (12k in, 1.5k out on the model about to be used) and settles one row per source after a turn that succeeded.
- **Embedded actions** have **two doors and both are metered**: `runUrgansAction` (the button) and `POST /api/releases/[id]/plan` (the chat assistant and the ungated fallback both use it). Without the second, a plan asked for in chat would be free, and the plan's model call is the expensive one. Both hold before the run and settle after it, and a structural guard (`credits-guard.test.ts`) pins that no other file does, that the hold comes before the run and the settle after, and that the refusal is **429, never 402** (the browser turns a 402 into a redirect to the paywall). The hold is a check, not a reserved row, so there is nothing to release when a run is cheaper or fails.
- **Estimates in the UI:** the planner's last step and the press-kit draft button/card show "This uses about 12 UrgAns credits." / "up to 25", only when the flag is on. `isCreditsEnabled()` now names `process.env.NEXT_PUBLIC_FEATURE_URGANS_CREDITS` directly in its default, because passing `process.env` whole is an empty object in the browser.
- **Display:** `GET /api/urgans/usage` returns a `credits` object when the flag is on (account, `nextGrantAt`, trial/allowance/topup, `low`), and `UrgansUsageStrip` shows a calm line once credits fall below 50 (corrected 2026-10-02: this said a fifth of the monthly amount, which #660 replaced). The chat box shows "N credits left" under the composer on every turn while credits are on; both read one shared request through `components/app/useUrgansUsage.ts`.
- **Admin:** `POST /api/admin/credits { workspaceId, credits, note }` grants or removes top-up credits (also how a Group account is funded); `GET ?workspaceId=` reads balances and the last 25 movements. It is **read-only on purpose** and does not go through `getCreditSnapshot`, which grants and removes.

### Things worth knowing before editing this

1. **The prices were checked against 123 real bills, and the gateway adds about 0.15 RODI per call** on top of tokens (the bill is also rounded up to a tenth). `PER_CALL_OVERHEAD_RODI` is that, measured. An unknown model is priced as the DEAREST one, and a call whose usage was not reported is charged as a nominal call, both flagged `assumed`. `model-prices.test.ts` fails if a ladder model has no price.
2. **A failed turn or run is never charged**, even though the provider billed its earlier rounds: settling happens only after success. Approving a confirmation card is never charged either. A guard pins both.
3. **It fails open** on an unreadable balance, like every other counter here. A LOST CHARGE logs loudly with the request id, and a turn's cost is also written onto its billing event (`metadata.credits`) so it can be reconciled.
4. **Known limit, accepted:** no lock between the check and the charge. Parallel requests all see one balance, so a team can overshoot by the work in flight; it lands as a negative top-up balance that blocks the next one.
5. **The ledger is append-only** and a guard enforces it. The window on an allowance row now only says which month it was for; it no longer decides what counts.
6. **Nothing here sells credits.** The naira rates and `TOPUP_PACKS` are recorded for when it is built; a guard fails if any file outside `lib/credits/` uses them, and `creditsForPack` returns null for any price that is not one of the four packs.
7. **`RODI_PER_USD = 743`** is the rate the provider's dollar-listed models imply, not a published rate. If it is wrong, credits are mispriced by the same fraction.
8. **The hold is 25 credits and the planner estimate 12** (the founder's figures). A real planner run is roughly one `gpt-5.4` call of a few thousand tokens in and out; measure real runs from `urgans_actions.input_summary.usage` before trusting either.

### Verified

Full suite **5,712 passing**, `eslint .` at the baseline of 3 errors / 83 warnings with nothing new, `tsc` clean apart from the documented `confirmed-action.test.ts` errors, and `next build` green in both flag states with `/auth`, `/dashboard`, `/locked`, `/onboarding` and `/settings` still static. **Twenty mutations, all killed** (eleven on the allowance and trial rules, nine on the embedded metering and the packs). The two migrations were applied in order to a real Postgres engine (PGlite) with old-shape rows in place, and the checks passed: old allowance rows rolling over, the trial grant once, the removal once, every constraint, one `credit_balances` taking one argument, row level security with no policies, and the browser roles unable to run it. (Two lines of that script print FAIL because they use a rejection helper for cases that are meant to be accepted; the lines after them confirm acceptance.)

### Not verified

No turn or run has been charged against a real database or a real gateway; the follow-up migration has not been applied to Supabase; the estimate lines and the banner have not rendered in a browser; no embedded run has stored real usage. The dollar-to-RODI rate rests on the catalogue.

### Not built, and what each needs

1. ~~**Buying credits.**~~ Built in #660 (flag-off behind `NEXT_PUBLIC_FEATURE_CREDITS_PURCHASE`; `/dashboard/credits`, `POST /api/credits/checkout`, `docs/credits-design.md`). The paywall half is "Credits-only access" below.
2. **Metering the status update, task outcome and voice transcription**, which go through `lib/ai/routed.ts` and the provider rather than an action.
3. **Showing what a single turn cost.** (The balance under the chat box and the history page now exist.)
4. **Charging the closing line after approving a card** (small and absorbed today).

### Activation

1. Apply `20261001130000_credit_ledger_sources.sql` (the first migration is already in).
2. Set `NEXT_PUBLIC_FEATURE_URGANS_CREDITS=true` in Vercel `Web` Production **with a commit that rebuilds `apps/web`** (the `turbo-ignore` trap). The changelog entry and version bump land at the flip, not at merge.
3. Check one real turn: send a message, then `GET /api/admin/credits?workspaceId=...` and compare the spend row's `provider_cost_rodi` with the same call in RodiumAi's usage log. Check one real plan the same way, and read `urgans_actions.input_summary.usage`.
