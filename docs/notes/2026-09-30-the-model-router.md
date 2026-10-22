# The model router (2026-09-30, built off; nothing changes until `AI_ROUTER` is set)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask: *"set up a model switcher that automatically routes ai request to
the suitable model ranging from the one it's currently using to the gpt 5.6, we
would decide the models once we check what the provider has available first."*
Until this, every AI call used ONE fixed model picked by an env var: UrgAns chat
on `CHAPPI_MODEL` (`openai/gpt-4o-mini`), the planner on `openai/gpt-5.4`, and
the other three single-shot features on `AI_STATUS_MODEL` or the gateway's
default. Now a router chooses the model per request from a four-rung ladder and,
when a model fails, moves the request sideways, down or up.

**Not a scope expansion.** It changes which model answers, not what exists.
**No migration, no client flag** (server-only env, read at request time), and
**no changelog entry or version bump at merge**: with `AI_ROUTER` unset nothing
a person sees changes, so by the EPK precedent an entry, if the flip is worth
announcing at all, lands at the flip.

**Two founder decisions, asked before building:** keep `openai/gpt-4o-mini` as
the floor rather than starting every request on a stronger model, and cap by
plan so cost follows what a team pays. **Three defaults were chosen and stated,
not asked:** automatic only (no model picker for users); every AI surface goes
through the one router but only chat chooses per request, the rest have fixed
policies with fallbacks; and shadow mode before live.

### What the provider has (public catalogue, read 2026-09-29)

`GET https://api.rodiumai.io/v1/models` is public and needs no key: 125 entries,
122 available. Prices are RODI per 1M tokens, and RODI is about 743 to the US
dollar (it holds for gpt-4o-mini, 5.4, 5.5 and Luna's published dollar prices).

| Model | In / out | Against 4o-mini | rpm / rpd | Note |
|---|---|---|---|---|
| `openai/gpt-4o-mini` | 111 / 446 | 1x | 60 / 5,000 | today's model, no reasoning |
| `openai/gpt-5.6-luna` | 149 / 891 | 1.3x / 2x | 30 / 2,000 | cheap frontier tier |
| `openai/gpt-5.4-mini` | 557 / 3,341 | 5x / 7.5x | 60 / 5,000 | |
| `openai/gpt-5.6-terra` | 1,485 / 8,910 | 13x / 20x | **10 / 500** | balanced tier |
| `openai/gpt-5.4` | 1,856 / 11,137 | 17x / 25x | 30 / 2,000 | the planner's model today |
| `openai/gpt-5.5` | 3,712 / 22,274 | 33x / 50x | 30 / 2,000 | same price as Sol, three times the room |
| `openai/gpt-5.6-sol` | 3,712 / 22,274 | 33x / 50x | **10 / 500** | flagship; the provider's `gpt-5.6` alias is Sol |

"gpt-5.6" is three models, not one. The provider also sells routers of its own
(`rodiumai/smart`, `rodium/{auto,basic,fast,pro,max}`) and they are **deliberately
not used**: they are opaque (no documented mapping, they may pick non-OpenAI
models) and one adds a billed hop, where our own router keeps model choice,
JSON-schema and tool behaviour under our control. `gpt-6-astra` exists and is out
of scope.

### The ladder and the policy

Four rungs, cheapest first, each `[primary, same-tier sibling]`. Model ids live in
`lib/ai/model-ladder.ts` and nowhere else in the router; every rung is
overridable by env, no deploy of code.

| Rung | Primary | Sibling | Output cap | Typical latency |
|---|---|---|---|---|
| quick | `gpt-4o-mini` | `gpt-5.6-luna` | 1,024 | 3s |
| standard | `gpt-5.4-mini` | `gpt-5.6-luna` | 4,096 | 6s |
| pro | `gpt-5.4` | `gpt-5.6-terra` | 4,096 | 12s |
| max | `gpt-5.5` | `gpt-5.6-sol` | 8,192 | 25s |

(Pro and max were `terra` then `5.4` and `sol` then `5.5` until 2026-10-01; see "What the live evaluation found" below.)

The latency column is a starting guess used only to decide whether a hop can
still finish in time; the evaluation below is where it gets measured.

| Surface | Starts | Floor | Max hops | Note |
|---|---|---|---|---|
| UrgAns chat turn | quick to max, by rules | quick | 2 | `CHAPPI_MODEL` is the quick rung's primary |
| chat close-out (`closeConfirmedAction`, round-cap summary) | quick | quick | 1 | no tools; the action already ran |
| rollout planner | pro | pro | 2 | the floor beats any plan ceiling |
| status update | quick | quick | 2 | |
| task outcome | quick | quick | 0 | a 3s budget cannot fit a second attempt |
| press-kit draft | standard | standard | 2 | |

### Things worth knowing before editing this

1. **Off means unchanged, and only the literal words switch it on.**
   `AI_ROUTER=on` routes, `shadow` decides and records but never changes which
   model answers (no hops either), anything else is off; `true`, `1` and `yes`
   deliberately do not count, so a habit from the `NEXT_PUBLIC_` flags cannot
   change what every request costs. It is also off whatever it says on a gateway
   that is not `rodiumai.io`, because the ladder is a list of RodiumAi catalogue
   ids: chat reads `CHAPPI_API_BASE` (default RodiumAi), the single-shot features
   read `AI_API_BASE`, whose default is NOT RodiumAi. **Off is not byte-identical
   in five small ways**, all deliberate and all covered by tests: a
   GPT-5-family `CHAPPI_MODEL` now gets `max_completion_tokens` (it was being
   rejected); a 400 that says a parameter was not accepted is retried once per
   model per turn with the other parameter, routed or not; a whitespace-only model
   env counts as unset; UrgAns's error mapping uses the typed classifier, so the
   gateway's own `rate_limit_exceeded` now reads "busy" and a gateway 504 or 408
   "took too long"; and the status and press-kit calls carry a 52 second deadline
   they never had.
2. **The plan ceiling reads `state` AND `tier`, never `tier` alone.**
   `resolveTeamTier` deliberately reports `label`, the uncapped flagship, for a
   trial, a grace period, a comped team, a grandfathered deal and anything
   unknown, so seat and release limits never bite during an evaluation. A cap read
   from `tier` alone would hand every 3-day trial the most expensive model. Only
   `state === 'paid'` gets its plan's ceiling (Solo to standard, Manager to pro,
   Label to max); everyone else, and any caller that did not say, is held at
   `AI_ROUTER_CEILING_TRIAL` (default pro). There is a named test for it, and it
   is mutation-tested. A consequence worth knowing when watching cost: a team on a
   legacy plan resolves to `label`, so it gets the max ceiling.
3. **A floor beats a ceiling.** `routeModel` lifts the ceiling to the surface's
   floor rather than leaving them contradicting each other, so the planner can
   never be capped below pro by a Solo plan: plan quality is a feature
   requirement, not something to trade for cost.
4. **A pinned model bypasses routing, and an existing pin stays a pin.**
   `AI_PLANNER_MODEL`, `AI_STATUS_MODEL`, `AI_OUTCOME_MODEL` (falling back to
   `AI_STATUS_MODEL`) and `AI_PRESSKIT_MODEL` (likewise) keep meaning "use exactly
   this": zero hops, no reasoning parameter from the router. Chat has no pin;
   `AI_ROUTER=off` holds it on `CHAPPI_MODEL`. **Check which pins exist in
   Vercel before the flip**, or the surfaces you expect to route will not.
5. **Chat is classified by rules, not by a model.** No extra request and no added
   latency, and fully testable. An analysis or strategy cue, a multi-step ask, a
   long creative brief, input over 600 characters and a correction after a first
   answer each add a point; a short question that opens like a lookup stays on
   quick; the score picks the rung (0 quick, 1 standard, 2 pro, 3 or more max) and
   the ceiling clamps it. Every threshold is a starting value to calibrate against
   the shadow log and the evaluation. **A turn stays on the rung it starts on
   unless something fails**, which protects the prompt-cache discount: every round
   carries about 14,000 tokens of fixed prompt (UrgAns's instructions plus 91 tool
   schemas, measured 14,851 and 42,817 characters).
6. **Failure handling is `nextAfterFailure`, pure and tested.** A rate limit, an
   unavailable model or a server error goes sideways to the same-tier sibling
   first (it has its own limit), then down; a timeout goes down first, since a
   same-speed sibling will not be faster; a bad answer or two failed tool rounds
   goes up one rung, within the ceiling and only if the slower rung can finish in
   time; a bad key, an empty balance or a malformed request stops (no other model
   fixes those). It never revisits a model, never goes below the floor, and is
   capped by the surface's max hops. **Terra and Sol are limited by the provider to
   10 requests a minute and 500 a day**, where gpt-5.4 and gpt-5.5 allow 30 and
   2,000. That is why 5.4 and 5.5 are the primaries on pro and max and Terra and
   Sol their fallbacks. The founder decided not to ask RodiumAi to raise the
   limits (2026-10-01), so the ladder works within them.
7. **The turn has a deadline, because slow rungs make the 60 second route ceiling
   real.** `TURN_BUDGET_MS` is 52 seconds against `maxDuration = 60`, so there is
   still time to record the turn and answer. A hop must fit the rung's typical
   latency plus 1.5 seconds; between rounds `fitToDeadline` steps down (not counted
   as a hop) or stops with `degraded: 'deadline'` and a plain "I ran out of time"
   reply; each request's own timeout is clipped to the time left. The single-shot
   features pass `deadlineMs` so a model's own retry loop leaves the next model
   time.
8. **Request shape follows the model family.** `max_completion_tokens` for the
   GPT-5 family and the o-series, `max_tokens` for everything else, and
   `reasoning_effort` only to models that accept it. The single-shot features send
   NO output cap and never have; the router does not add one. **What was UNKNOWN
   when this was built, and only the live evaluation can answer:** whether
   RodiumAi accepts `reasoning_effort` together with `tools` on the GPT-5 models,
   and whether it takes `max_tokens` on them at all.
9. **What a routed turn leaves behind.** `billing_events.metadata.routing` on the
   ordinary `urgans_action` event (the type is unchanged, so the monthly 40/150
   count is untouched, and there is no migration), and `inputSummary.routing` plus
   the real `model` on the two embedded actions' `urgans_actions` rows. It is in
   the database because Vercel Hobby keeps logs briefly. A console line
   (`[ai-router]`) is written for every shadow turn and, when live, only for a
   turn with a hop, a failure or a missed deadline. The query that reads a shadow
   run is in `apps/web/.env.example`.
10. **Bugs this exposed and fixed.** `/api/urgans` detected a rate limit with
    `/rate[- ]limit/i`, which never matched the gateway's own
    `rate_limit_exceeded`, so a real 429 was reported as "unavailable"; the
    mapping now comes from a typed classifier (`describeAgentError`).
    `parseToolArguments` silently turned malformed tool arguments into `{}`; the
    call still runs with `{}` exactly as before, but it now counts as the model
    struggling, and two such rounds escalate once.
11. **Nothing can quietly go around it.** `lib/ai/model-router-guard.test.ts` scans
    the real source: a model id is written in exactly three files (the ladder,
    `provider.ts`, `planner-model.ts`); the provider's two generators are called
    from `routed.ts` only; the per-feature model env vars and the router's own
    switches are read in the router (and the two files that already owned them);
    and `chat/completions` is spoken to by exactly two files. `legacy-model-
    agreement.test.ts` pins what each surface used before the router (35 cases
    against `resolvePlannerModel()` and the old inline env expressions), so "off"
    cannot drift.

### The evaluation, and how to run it

`lib/ai/model-eval.integration.test.ts` is the one router test that needs the
network and a key, and it is opt-in (`ROUTER_EVAL=1`); `pnpm test` never runs it.
It answers the two things the router can only guess at, against UrgAns's REAL
system prompt and all 91 REAL tool schemas: **shape probes** (does the gateway
accept, on each rung's model, exactly what chat sends and exactly what the
single-shot features send, built by the same code that builds them in production)
and **tool choice** (28 cases in `lib/ai/model-eval-cases.ts`, each scored on
whether the model's first move is right; reports accuracy, latency percentiles,
tokens, cache share and cost per model, plus a case-by-model grid showing which
rung the router's rules would start each case on). A spending cap
(`ROUTER_EVAL_MAX_USD`, default 8) stops it; the default run costs a few dollars.
The key is read from `ROUTER_EVAL_API_KEY` (or `CHAPPI_API_KEY`, `AI_API_KEY`),
sent only as a header, and scrubbed from anything that comes back; the header of
the test file has the PowerShell to set it for one process without echoing it.

The scoring is pure (`lib/ai/model-eval.ts`, mutation-tested) and the cases are
tied to the live registry by an offline test, so a renamed tool fails a normal
test run instead of quietly scoring every model wrong. **The harness itself was
rehearsed against a local fake gateway** (a 429 with Retry-After, an empty answer,
a request that echoes the caller's key back, a low spending cap) and the fake key
appeared nowhere in the output or the JSON file.

### Deliberately not built

A user-facing model picker; a model-based classifier (an extra hop on every turn);
the provider's own routers; a per-team model override; an admin view of routing in
`/admin/urgans` (the data is in `billing_events.metadata` for it, and the query is
in `.env.example`); per-team cost budgets; `gpt-6-astra`.

**Noticed and not fixed:** `app/api/urgans/actions/route.ts` exports no
`maxDuration`, so on the Hobby plan its default function timeout applies to the
planner's 52 second deadline. It is dark behind `NEXT_PUBLIC_FEATURE_URGANS_ACTIONS`;
add `export const maxDuration = 60` when that track activates.

### Verified

**Full suite:** 251 test files passed and 4 skipped, 5,182 tests passed and 68
skipped, none failing (`vitest run --testTimeout=90000`). The router's own 16 new
test files hold 361 running tests, plus 38 that are opt-in (the 36-case live
catalogue check and the 2 live-evaluation tests); `provider.test.ts` grew too.
At the default 5 second limit, a parallel full run on this Windows machine times
out 7 tests in six whole-tree-scanning or bash-spawning guards
(`icons-registry`, `press-kit-copy-guard`, `schema-fallback-guard`,
`settings-links-guard`, `textile-ground-guard`, `vercel-ignore-build`); every one
passes on its own, so that is load on this box, not an assertion.

**Static checks:** `eslint .` at 3 errors / 83 warnings, which is the same number
on this base: the 11 modified tracked files lint at 0/0 at HEAD (checked by
linting the committed copies) and at 0/0 now, and none of the new files has a
finding, so nothing was added. (The 78 recorded elsewhere in this file is older;
main has grown since.) `tsc --noEmit` is clean apart from the 8 documented
`confirmed-action.test.ts` errors. `next build` is green by exit code with
`/auth`, `/dashboard`, `/locked`, `/onboarding` and `/settings` still `○ Static`.

**Route probes** on `next start`, with the router unset, `shadow`, `on` and a
wrong word (`true`), gave identical answers in all four: `POST /api/urgans` 401
unauthenticated (auth runs before any routing, assistant flag on), the control
route 401, `/api/version` 200. The generate-status, plan and outcome routes
answer the exact flag-gate 404 body, because their own feature flags are off in
that build; they were not probed with the flag on.

**Mutation-tested,** each mutation confirmed to have applied before its result
was believed and each file restored afterwards: the runner 41/41 killed, the
API-route glue 17/17, the structural guard 8/8, the evaluation's scoring, cost
and empty-answer arithmetic 16/16, and its case checks 5/5. The survivors met
along the way were real test gaps (a custom-error-message path in the router, a
`trace.endTier` assertion in the runner) and were closed, not excused.

**The evaluation harness was rehearsed end to end against a local fake gateway**,
three ways: the full 7-model run (a 429 with Retry-After retried and answered,
28 probes, 196 cases), a cases-only run in which an empty answer is scored as a
failure, and a $0.05 cap that stopped the run and reported what it had skipped.
The fake key appears nowhere in the output or the JSON, including in a request
the fake made fail with the key echoed back.

**The live catalogue check** (`ROUTER_CATALOG_CHECK=1`) passed against the real
public catalogue on 2026-09-30: every ladder model is available and lists tool
and JSON support, takes `reasoning_effort` exactly when the router thinks it
does, and allows at least the output tokens its rung asks for; the rung primaries
rise in price; Terra and Sol are still 10 requests a minute and 500 a day.

### Not verified, and it is the whole risk

**No real model has been called with this code.** This sandbox has no RodiumAi key
and the live evaluation has not been run, so three things rest on reasoning and
tests alone: that the GPT-5 rungs accept the request shape chat sends (item 8),
that the classifier's starting thresholds send the right cases to the right rungs,
and that the rungs' latency figures are close enough for the deadline logic. The
catalogue check (`ROUTER_CATALOG_CHECK=1`) does confirm every ladder model is
available and lists tools and JSON mode. Nothing has run against a real database
either, so no `routing` metadata has been written to a real `billing_events` row.

### Activation

1. In Vercel `Web` (Production), confirm `AI_API_BASE=https://api.rodiumai.io`,
   `CHAPPI_API_KEY` and `CHAPPI_MODEL`, and list any pins (item 4); remove the ones
   you want routed.
2. Run the live evaluation once with the key: `ROUTER_EVAL_PHASES=probes` first and
   read the shape table. If a rung's shape is rejected, fix the ladder with
   `AI_LADDER_*` (env only) before anything else. Then the cases, starting with
   `ROUTER_EVAL_MAX_CASES=8`, and adjust the ladder, effort and ceilings from the
   grid.
3. ~~Ask RodiumAi to raise the Terra and Sol limits~~ (decided against; the ladder
   was reordered instead). **Top up the RODI balance first**: see "What the live
   evaluation found".
4. Set `AI_ROUTER=shadow` and redeploy (Vercel snapshots env per deployment). Let
   it collect for a few days and read it with the query in `.env.example`.
5. Set `AI_ROUTER=on` and redeploy. Watch the RODI balance, the `[ai-router]`
   lines, p90 latency against the 60 second ceiling, and support reports. To back
   out, set it to `off` (or unset it) and redeploy: every surface returns to its
   fixed model.
6. Changelog entry and version bump only if the flip is worth announcing.

---

### What the live evaluation found (2026-10-01)

The evaluation was run for the first time, against RodiumAi, from the founder's terminal (the key is only ever set for that one process). Probes first, then 8 of the 28 cases. Both runs are in `apps/web/router-eval-*.json` on the founder's machine and are not committed.

1. **The 5.6 models (luna, terra, sol) reject function tools with any `reasoning_effort` but `'none'`** (400, "Function tools with reasoning_effort are not supported ... set reasoning_effort to 'none'"). The router sent `'low'` on every rung, so every chat turn on those rungs would have failed. `effortForTools` in `lib/ai/provider.ts` now turns any effort into `'none'` when tools are sent to a 5.6 model, and it sits inside `buildChatCompletionBody` so the evaluation and a real turn send the same body. Tool-less requests keep the effort asked for (the close-out round, and every single-shot feature, which all passed their probes). `'none'` and omitting the parameter were both accepted. The runner's old retry-without-effort on a 400 mentioning "reasoning" would only have covered this at the cost of a wasted request per turn.
2. **The ladder was reordered**: pro is `gpt-5.4` then Terra, max is `gpt-5.5` then Sol. On the real chat prompt (14.6k tokens, 91 tool schemas) gpt-5.4 picked a right first tool 6 of 8 times against Terra's 4 of 8 (a small sample), billed 4.2 RODI per call against Terra's 4.5, and has three times the request room. 5.5 is priced like Sol with the same room advantage. The quick rung was left alone: `CHAPPI_MODEL` already controls its primary, and luna scored the same as gpt-4o-mini on 8 cases.
3. **Billed cost per call on the real chat prompt** (RODI; about 743 to the dollar): gpt-4o-mini 0.57, luna 0.68, gpt-5.4-mini 0.85, gpt-5.4 4.2, terra 4.5. Sol and gpt-5.5 were never measured on it; at list price they are estimated near 60 RODI per call. A chat turn can make several calls.
4. **The account holds very little.** The wallet showed 91.0 RODI (about $0.12) with 499 RODI (about $0.67) ever recharged and 408 spent; its low-balance threshold is 500. **The provider reserves the full output cap against the balance before answering**, which is why Sol and gpt-5.5 returned 402 "Insufficient RODI balance" on every real-prompt case (and Sol on the chat probe at an 8,192 cap, while a 256 cap was accepted), and why gpt-5.4-mini and Terra started failing late in the run. **Before `AI_ROUTER=on`, top up**, or the dearer rungs will 402 and the router, which stops on a 402, will not fall back. Reading the balance and usage: the RodiumAi dashboard's `/api/v1/wallet` and `/api/v1/usage` answer to the logged-in session.
5. **Not yet known:** whether the top-rung models are worth their price on tool choice (the 8-case sample could not reach them), the real latencies, and how the classifier's thresholds line up with the cases. A full run that skips Sol (`ROUTER_EVAL_MODELS` takes a comma list) is budgeted at about $2.

### The first live max-tier turn timed out, and the output cap now follows the clock (2026-10-02)

The router went live (`AI_ROUTER=on`) and was tested on production: a simple turn stayed on quick (gpt-4o-mini, 3s), an analysis turn went to pro (gpt-5.4, 21s), and a long multi-step request went to max (gpt-5.5) and **failed with "UrgAns took too long"**. Rounds 1 and 2 (reading the data) were fine; round 3, writing the answer, was allowed 8,192 output tokens but only about 30 seconds were left. gpt-5.5 streams about 95 tokens a second, so it needed about 86 seconds, the request was abandoned at about 51, and **RodiumAi billed the whole abandoned answer anyway: 8,127 tokens, 200.6 RODI** (the whole turn about 323 RODI, about $0.43, nothing delivered, no credits charged).

- **The cap is bounded by speed now, not by what the model can write.** Each ladder rung carries `startupMs` and `outputTokensPerSec`, deliberately slow, and `outputCapForTime` (`lib/ai/model-router.ts`) turns the time left into a token cap, never above the rung's own cap and never below `MIN_USEFUL_OUTPUT_TOKENS` (600). `fitToDeadline` and every hop apply it, so each round is asked to write only what it can finish. A turn that gets cut short by the cap is a shorter answer, which is better than an error plus a bill.
- **Caps lowered:** pro 4096 to 3000, max 8192 to 3000 (quick 1024 and standard 4096 unchanged). `model-ladder.test.ts` now asserts every rung can stream its whole cap inside `TURN_BUDGET_MS`, which would have caught the 8,192.
- **Abandoning a request does not stop the bill.** That is the reason the cap matters more than the timeout.
- Still true and still open: a long answer is simply shorter than it could be. If that proves too limiting, streaming the reply is the real fix and was not built.
