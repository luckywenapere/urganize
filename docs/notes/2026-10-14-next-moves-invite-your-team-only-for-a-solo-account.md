# Next moves: Invite your team only for a solo account (2026-10-14, v1.128.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: the Invite card was "too persistent; if a user has invited their team before it should not be popping up". `GET /api/next-moves` now also returns `hasTeam` (`readHasTeam` in lib/next-moves-server.ts: anyone invited or active in the workspace the viewer owns, owner and removed excluded; null on a failed read). `pickNextMoves` shows Invite only when `hasTeam === false` (unknown means don't ask, so it never flashes), and a "Not now" on any rollout's Invite hides it on all of them (any dismissed `invite:` key). The three invite senders (TeammatesSection, InviteGate, TaskDetailView) call `useNextMovesStore.getState().markHasTeam()` on success so it goes at once.
