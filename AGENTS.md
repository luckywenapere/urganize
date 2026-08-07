# AGENTS.md

**Read [`CLAUDE.md`](./CLAUDE.md) instead. It is the single source of truth for AI coding assistants working in this repository, regardless of which assistant you are.**

This file exists only because some tools (Codex and others) look for `AGENTS.md` by convention and would otherwise find no guidance at all.

## Why this is a pointer and not a copy

It used to be a copy — a snapshot of `CLAUDE.md` taken 2026-07-13 and never updated. By 2026-08-07 it had drifted 164 lines behind and was actively wrong in ways that would have caused bad decisions:

- It listed **native mobile apps as forbidden**, while `apps/mobile` had been in the repo since 2026-07-21 and shipped a signed Android build on 2026-08-07.
- It listed **credit submissions / shareable credit links as forbidden**, after the founder sanctioned them as the release metadata hub (2026-07-31).
- It placed **Chappi at the top of `/dashboard`**, which stopped being true when the assistant moved to its own page (later renamed `/dashboard/urgans`), was renamed UrgAns for users, and gained a side rail.
- It described AI routing to "**Codex Sonnet**" and "**Codex Haiku**" — a find-and-replace of "Claude" that mangled real model names into ones that do not exist.
- It still documented the homepage admin's shared-secret cookie auth and `chart.js`, both retired 2026-07-30.

Two documents describing one codebase means one of them is always lying, and the stale one is invisible until it misleads someone. `CLAUDE.md` is the one that gets maintained, so this file defers to it entirely.

**Do not restore a copy here.** If a tool needs `AGENTS.md` to contain the real content rather than a pointer, make it a symlink to `CLAUDE.md`, or generate it at build time — never a hand-maintained duplicate.
