# UrgAns prompt-coverage pass: two insight tools, and the honesty rule (2026-09-03)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder pasted a real-world ~70-prompt reference list (creative direction,
release planning, content ideas, marketing strategy, audience growth, show
prep, team management, career strategy, data intelligence) and asked whether
UrgAns can "handle these perfectly," plus asked to be moved onto a written
test-driven habit going forward. **Not a scope expansion** — no new tool
reaches outside a release or its tasks, and the audit that came first is the
part worth reading before touching either tool again.

**The mechanical finding, which is what made this a small change rather than
a large one.** `runner.ts`'s tool-calling loop already breaks cleanly the
moment a round returns zero tool calls — a pure creative-writing turn ("give
me 20 TikTok ideas") needs no new code path, it already works today. The gap
was never "no code exists," it was that the system prompt never told the
model this kind of question is welcome, and never told it what to do when a
prompt asks for data Urganize does not collect.

**A real chunk of the list cannot be answered honestly with real numbers.**
Streaming counts, campaign/ad performance, audience demographics — none of it
exists in the product (no DSP integration, no analytics dashboards, both
still correctly out of scope). Founder call: UrgAns says so plainly in the
first sentence rather than inventing a figure or refusing outright, then
still helps with what it does have.

**Two genuine tool-shaped gaps survived the audit against everything else in
the list; nothing else needed a new tool.** Every state-visibility prompt
("what's blocking this release," "identify overdue/high-priority tasks,"
"summarize the current state") was already covered, redundantly, by
`get_dashboard`, `get_release_context`, `list_tasks`, and
`generate_status_update`. What had no tool at all:

- **`compare_releases`** (read) — the N most recent releases side by side:
  date, status, task completion, days ahead of/behind today. Powers "compare
  my last three releases," "based on previous releases what should I
  change," "identify trends." Pure core: `compareReleases` +
  `compareByRecency` in `lib/chappi/tool-families/insights.ts` — later date
  first, an undated release sorts last rather than being dropped, and
  progress is a rounded percentage that never divides by zero.
- **`get_team_workload`** (read) — every teammate's open and overdue task
  count, plus how much is unassigned, tallied separately rather than folded
  into anyone's total. Powers "who should be responsible for each part."
  Pure core: `computeTeamWorkload` in the same file — a task assigned to
  someone who has left the team (present on the task, absent from
  `members`) is counted as neither theirs nor unassigned, since either would
  misreport whose it is.

**`get_team_workload` is Chappi-only, deliberately absent from
`lib/mcp/tools.ts`'s allow-list.** It proxies `GET /api/workspace/members`
via `callInternalApi`, and that handler does not accept the internal actor —
the exact reason `list_workspace_members` itself was never allow-listed
either. Adding it anyway would have advertised an MCP tool that 401s, the
precise mistake `tool-registry.test.ts`'s "only proxies routes whose handler
accepts the internal actor" check exists to catch (and did catch, on the
first attempt at this — the fix is leaving it out, not touching the route).
`compare_releases` has no such dependency — it reads through
`listVisibleReleases`/`TaskService` directly, like `get_dashboard` does — so
it is allow-listed, and `protocol.test.ts`'s tool-count tripwire moved
13 → 14.

**Show-prep prompts are a known, deliberately deferred gap, flagged rather
than silently built.** Events (shows/setlists/DJ packs) has zero Chappi
tools. It is a sibling surface to releases, and every existing Chappi tool
reads or mutates a release or its tasks — the founder-sanctioned rule this
file has stated since Chappi's own sanction in 2026-07-13. Wiring Events in
is its own tool family with its own confirmation-gating calls (a DJ pack
send is already gated in the UI's own terms) and was explicitly out of "a
few closing tools." Left for its own pass.

**The system prompt gained two sections**, not a rewrite of what was there:
one line sanctioning creative-direction/content-idea/marketing-strategy/
career-strategy conversation in plain prose with no tool call required
(mirroring the existing "suggesting activities is welcome" line for tasks),
and one line requiring the model to say plainly it has no streaming/audience/
campaign data rather than invent a number. `ROLE` is now exported specifically
so both lines get a direct content assertion (`system-prompt.test.ts`) rather
than resting on nothing — nothing type-checks a sentence, and a future prompt
rewrite silently dropping either line would otherwise go unnoticed.

**This is also the first pass under the new "write the test first" habit**
(see the new Conventions → Tests subsection) — `insights.test.ts` was written
and confirmed red (module didn't exist) before `insights.ts` did.

- **Verified:** 2118 tests passing (19 new: 16 in `insights.test.ts`, 3 in
  `system-prompt.test.ts`), `eslint .` at the exact pre-existing baseline
  (3 errors / 70 warnings, all in `WorkspaceView.tsx`, unrelated to this
  work), `tsc --noEmit` clean apart from the documented pre-existing
  `confirmed-action.test.ts` errors, `next build`'s compile + typecheck steps
  both clean (the static-export step cannot run in this environment — no
  `.env.local`, no Supabase URL — a pre-existing sandbox limitation, not
  something this change introduced).
- **No new flag, no migration.** UrgAns is already gated by
  `NEXT_PUBLIC_FEATURE_CHAPPI`; these are two ordinary additions to its
  existing tool registry, live for any account UrgAns is already live for the
  moment this merges to `main`.
- **Not verified, and it is the whole remaining risk:** no live model call has
  run from this sandbox (no network route to either urganize domain), so
  whether the two tools' descriptions are clear enough for the model to reach
  for them unprompted, and whether the system prompt's two new lines actually
  change real answers, rest on the tests above plus a traced read of the
  runner loop — not on anything observed. Worth one real pass against the
  deployed assistant: ask a handful of prompts from the founder's original
  list spanning each category (a pure ideation one, a data-gap one, and
  "compare my last three releases" / "who should be responsible for each
  part" specifically) and confirm the tone, the tool calls, and the honesty
  line all land as designed.
