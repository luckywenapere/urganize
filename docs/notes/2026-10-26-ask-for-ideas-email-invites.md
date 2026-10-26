# Ask for ideas: invite by email (2026-10-26, flag NEXT_PUBLIC_FEATURE_IDEA_EMAIL_INVITES, OFF)

Slice 2 of the founder-approved mock ("Rollout idea flow mock": one idea card, Ask for ideas, keep planning, review when an idea changes). Decisions made with the founder:
- Asking for an idea is the invite moment. A person not on Urganize gets a **full team invite** (uses a seat), not a no-seat idea link.
- **Suggest, don't change:** a new idea never rewrites the plan or briefs on its own (slice 3; the review panel already exists, see "New ideas update an existing plan" in `2026-10-26-rollout-team-brief.md`).
- Kept plain first: no referral credits yet, measure first (`idea_invite_sent`, then whether invitees start their own rollout).

## What it does
In "Who should chime in?" (`WhoShouldChimeIn` in `RolloutIdeasCard.tsx`), owners see "Add someone by email", an Artist / Team member choice, and a queue. Nothing is sent until **Send N requests**: queued addresses are invited through `POST /api/workspace/members/invite` (with `releaseId`), then the ticked teammates are asked through `ideas/ask`. The old WhatsApp and copy-link path stays under "Or share a link instead".

## Where things are
- Pure rules, tested: `lib/rollout-ideas.ts` (`isIdeaEmailInvitesEnabled`, `parseIdeaInviteEmail`, `addPendingInvite`, `MAX_IDEA_INVITES`).
- Invite route: optional `releaseId` (ignored while the flag is off). It goes through `ensureReleaseTeamWriteAccess`, adds `?next=/dashboard?release=<id>` to the emailed link (`withInviteNext`) so the invitee lands on the rollout, and scopes an ARTIST invite to that rollout's artist. `team_member_invited` carries `source: 'ask_for_ideas'`.
- Seat refusal (409): the card shows the route's own message plus "See plans" (opens Billing) and "I'll type the idea myself". The rollout is never blocked. Solo (1 seat) always hits it. Anything still queued stays queued.

## Differences from the mock
- The field takes an **email**, not "name or email": a name alone cannot invite anyone. Existing teammates are still ticked from the list.
- The email sent is the existing generic `workspace_invite` template. It does not say it is a request for an idea. A dedicated template is a follow-up.
- Not rendered in a browser; nothing run against a real database or a real email send.

## Not done
Slice 3 wording and tracking beyond `idea_invite_sent`, referral credits, and the changelog entry (goes in at the flag flip).
