# UrgAns tailoring reliability + a persona (2026-09-08, v1.32.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report: a plan `generate` came back *"UrgAns could not tailor it this
time, so nothing was changed."* That is the generic one-off-failure copy in
`PlanScene.tsx`, not the "not switched on" one, so the gateway was configured
and a real tailoring call failed. He also asked for two follow-ons: give
UrgAns a real character (strict, bossy, a creative who wants things *done*),
and make sure its output always reads clean.

**The retry bug.** `lib/ai/provider.ts`'s `generateStructuredAiOutput` and
`generatePlainTextAiOutput` only marked a failure `retryable` when the gateway
returned a classified 429/5xx, or when running on OpenRouter's free
auto-router. A client-side `AbortError` — our own timeout firing — went
through neither path and fell back to `retryable: isFreeAutoRouter`, which is
`false` for every real deployment (RodiumAi is not the auto-router). So a
timeout was fatal on attempt one no matter how high `maxRetries` was set —
directly contradicting the planner route's own comment, which sets
`maxDuration = 60` on the stated assumption that `PLANNER_TIMEOUT_MS` (25s) ×
`PLANNER_MAX_RETRIES` (2) attempts actually happen. Fixed by making an
`AbortError` retryable on its own merits in both functions, the same as a
429/5xx — a slow response says nothing about the next attempt. Covered by the
new `lib/ai/provider.test.ts` (mocked `fetch`: one abort then a success
confirms a second attempt fires; a second case confirms it still gives up once
`maxRetries` is exhausted).

**The persona.** `lib/chappi/system-prompt.ts`'s `ROLE` and
`lib/release-planning.ts`'s `buildSystemPrompt` (the tailoring call that
writes the plan's `rationale`, `reason`, `warnings` and rewritten "why" lines
— everything the manager reads as coming from UrgAns) both gained the same
"Who you are" / "Voice" paragraph: strict, a little bossy, a creative who
cares about one outcome — getting the release out — and pushes rather than
just reports. `system-prompt.test.ts`'s coverage tests (every registered tool
named in `ROLE`, no unregistered name mentioned) and its two content
assertions (`compare_releases`/`get_team_workload` named, ideation sanctioned,
the no-streaming-data admission) all still pass — the persona text is plain
prose with no snake_case tokens, so it cannot trip the stale-tool-name check.

**The formatting bug.** Assistant replies render as raw `whitespace-pre-wrap`
plain text (`ChappiConversation.tsx`) — there is no markdown renderer anywhere
in this stack, and adding one was out of scope (boring-stack rule). So any
`**bold**` or `#` heading the model wrote was showing up as literal
punctuation. Both prompts above now explicitly forbid markdown syntax in every
string value (no asterisks, no headers, no backticks) and ask for a plain
`"- "` prefix when a list genuinely helps.

`release-planning.test.ts`'s exact-substring assertions on `buildSystemPrompt`
(`'You cannot add tasks.'`, `'NEVER drop a task whose "optional" is false'`,
the phase-scoping line) were checked against the edit and still pass — the
persona paragraph was inserted around them, not through them.

**Not verified against production or a real model call** — this session has
no route to either urganize domain and cannot mint a session, so the retry fix
rests on the traced bug plus the new unit tests, and the persona/formatting
change rests on the prompt text plus `vitest`/`eslint`/`tsc` passing clean.
Worth one real pass once deployed: generate a plan for a release with a tight
budget vs. a comfortable one and confirm the rationale reads differently and
in voice, and watch whether "could not tailor" gets rarer. No migration, no
new flag — both surfaces (Chappi, the release planner) are already live.
