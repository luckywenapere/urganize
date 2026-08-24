# UrgAns Shared Context — Implementation Spec

## What you are building

UrgAns starts every conversation blank. Each member re-explains the same things — which artist, which release, how this label works — before getting a usable answer. That re-explaining is the problem.

Two layers fix it.

**Layer 1 — Workspace Context (correctness).** UrgAns can see the actual work: releases, tasks, owners, dates, attached files. This should feel like a bug fix, not a feature.

**Layer 2 — Team Brief (the feature).** One persistent document per workspace describing the team: artists, positioning, how they run rollouts, constraints, vocabulary. UrgAns reads it on every request. Any member can edit it.

**Explicitly out of scope:** shared visibility of other members' UrgAns conversations. Do not build it. Do not leave hooks that assume it. Threads stay private to their author.

---

## Layer 1 — Workspace Context

### Behaviour

Every UrgAns request resolves context in this order:

1. **Focal object.** If the conversation was opened from a release, task or file, that object is the focus and is passed in full.
2. **Workspace summary.** Always included: active releases with status and key dates, task counts by owner, overdue items, team member names and roles.
3. **Retrieved detail.** Pulled on relevance to the user's message — other releases, task histories, file contents.

### Requirements

- Retrieval is scoped to the workspace of the requesting user. A user must never receive content from a workspace they are not a member of. Enforce this at the query layer, not the prompt layer.
- Index file contents on upload, not at request time. Chunk and embed. Do not stuff raw files into the prompt.
- Cap the workspace summary at a fixed token budget. When a workspace exceeds it, degrade by recency and activity — most recently touched releases survive, dormant ones drop out.
- Cache the workspace summary. Invalidate on write to any release, task or membership. Do not recompute per message.

### Acceptance

- Open UrgAns from inside a release and ask "what's left on this?" — correct, current task list with owners, no prompting for context.
- Ask "what's overdue across everything?" from anywhere in the app — correct answer spanning all releases.
- A user in Workspace A can construct no prompt that returns data from Workspace B. Write a dedicated test for this.

---

## Layer 2 — Team Brief

### Data model

One brief per workspace. Structured sections, not a freeform blob — structure is what makes it fillable, reviewable and injectable in priority order.

| Section | Purpose |
|---|---|
| Roster | Artists the team works with, and where each one is right now |
| How we work | Rollout habits, cadence, what a release means here |
| Positioning | How the team talks about its artists and itself |
| Constraints | Budget reality, territories, platforms, things they don't do |
| Vocabulary | Internal shorthand UrgAns should understand and use |

Each section is plain text, editable and individually versioned. Store `updated_by` and `updated_at` per section. Keep version history — this becomes an audit trail when a label asks why UrgAns started saying something new.

### Prompt assembly

- Inject the brief into the system prompt on **every** UrgAns request, above workspace context.
- Precedence when sources conflict: user's current message > focal object > workspace context > team brief. The brief is standing background, not an override. If a task says the deadline moved, UrgAns trusts the task over the brief.
- Omit empty sections entirely. Never inject a section header with placeholder text — that teaches the model to hallucinate into the gap.
- Cap each section at a fixed length with a visible character counter in the UI. A brief that grows without limit degrades every answer in the workspace.

### Permissions

- Any workspace member can read the brief.
- Any workspace member can edit it by default.
- Add a workspace setting to restrict editing to admins. Off by default.

### UI surfaces

**Brief editor.** A dedicated page in workspace settings. Section-by-section editing, inline save, "last edited by X" per section.

**Empty state.** The brief starts genuinely empty. Do not pre-fill it with example content the user has to delete. Frame it as: the workspace stays clean, UrgAns is what gets the head start. Offer a short question per section ("Which artists are you working with right now?") as placeholder text inside the input, never as saved content.

**Inline nudge.** When UrgAns answers in a workspace with an empty brief, surface a small dismissible affordance: "UrgAns doesn't know your team yet." One click to the editor. Show it a few times, then stop.

**Attribution.** When an answer was materially shaped by the brief, show a subtle marker the user can expand to see which sections were used.

### Acceptance

- Same prompt, same workspace, brief empty vs. brief filled — the filled version produces a visibly more specific answer. This has to hold on a real workspace, not a rigged one.
- Member B benefits from a brief written entirely by Member A, with no action of their own.
- Editing the brief changes the next answer immediately. No cache staleness.

---

## Onboarding hook

Add a flow that walks a new team through filling the brief section by section, completable live on a call in under fifteen minutes. Track completion percentage per workspace and expose it in internal account views.

---

## Build order

1. Layer 1 retrieval and scoping, including the cross-workspace isolation test.
2. Team brief model, editor and injection.
3. Empty state and inline nudge.
4. Attribution markers.
5. Onboarding flow and completion tracking.

One phase per session. Stop at the end of each phase and open a PR. Do not run ahead.

---

## Working rules

- Do not refactor unrelated code. If you find something broken outside this scope, report it instead of fixing it.
- Match existing patterns in the codebase over the suggestions here. This spec describes intent, not house style.
- Every phase ships with tests. The workspace isolation test is non-negotiable.
- If a requirement here is wrong once you have seen the code, say so before implementing it.
- The word "workspace" in this document is internal terminology only. It is prohibited in user-facing product copy — use it in code and schema names, never in UI strings.

---

## Open questions

- Does the brief apply per workspace or per artist? Per workspace is right for a small label. A services team managing eight unrelated artists may need artist-scoped sections. Build workspace-level, but do not make artist-scoping impossible later.
- Should UrgAns propose edits to the brief based on what it observes? Powerful, but it means the model writing its own instructions. Defer. Do not build toward it silently.
