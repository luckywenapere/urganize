# Rollout ideas, "Chime in" (2026-10-26, v1.176.0, NEXT_PUBLIC_FEATURE_ROLLOUT_IDEAS ships on)

Founder-approved flow. The artist or manager talks (voice note) or types an idea on a rollout, asks others to chime in, and the owner turns everyone's notes into a plan with AI (the planner intake, prefilled) or by hand.

## Where things are
- **Rules (pure, tested):** `lib/rollout-ideas.ts` + `lib/rollout-ideas.test.ts`. `ideasPathFor` (owner + persona + teammates: `solo` | `manager` | `chime_in`), `ideasToExtraNotes` ("Name: text" lines, capped at `MAX_EXTRA_NOTES_LENGTH`), `safeInviteNextPath` / `withInviteNext` (invite landing), recipients, copy.
- **Server:** `lib/rollout-ideas-server.ts` (read notes and people; pushes and emails, never throw, run through `afterResponse`).
- **Routes** (`app/api/releases/[releaseId]/ideas/`, 404 when the flag is off, enlisted in `release-access-guard.test.ts`): `GET` notes + people + `voice`; `POST` a note; `ask` (push + email the ticked teammates); `transcribe` (the mic); `plan-ready` (owner only, rollout must have ideas).
- **Card:** `components/workspace/RolloutIdeasCard.tsx`, mounted once in `WorkspaceView` beside the next moves (phone header `below`, desktop `banner`). Shows while the rollout has no plan, and on any rollout with notes.
- **Email:** template `chime_in` (`ChimeInEmail.tsx`), category `chat`, so the existing chat unsubscribe covers it.

## Decisions and traps
- **Storage: rows in `release_messages`.** No new table, no migration. The release chat that reads the same table stays cut (`lib/cut-features.json`). If release chat ever comes back, these notes show in it, and old chat messages already show here as notes.
- **Who sees what:** owner with persona `independent_artist` (or the retired `producer_beatmaker`) and nobody else on the rollout gets the solo path (Draft with AI leads, plus "Get your manager or team to chime in" with a link). Every other owner gets "Who should chime in?" after a note. Anyone else on the rollout gets "Chime in on <Name>'s idea". Draft with AI only for the owner with the planner on (plan building is owner-only, see `release-draft-plan.ts`).
- **Artist ticked by default** only when a teammate has role `artist` and an artist name (or name) equal to the rollout's artist. Never guessed.
- **Invite links** reuse `POST /api/workspace/invite-link` (owner/admin only; seat limits apply, so a Solo plan sees the seat message) with `releaseId`, then `withInviteNext` adds `?next=/dashboard?release=<id>`. `/join/[code]` and `/invite/accept` read `next` through `safeInviteNextPath` (same-origin `/dashboard` paths only) and land there after joining, including after the Google round trip. Gap: someone who joins through email confirmation on another device lands on Home, not the rollout.
- **Voice:** `components/chappi/useVoiceInput.ts` gained `endpoint` and `deniedMessage`. The upstream speech call moved to `lib/voice-transcribe-server.ts`; both transcribe routes keep their own gate, the per-team daily cap and the `urgans_voice_transcription` billing event (so one abuse cap), and never charge credits. The ideas event carries `source: 'rollout_ideas'`. No `CHAPPI_API_KEY` means `voice: false` and the card offers typing only. The UrgAns voice flag stays cut.
- **Hold to talk:** a hold of more than 400 ms stops on release; a quick tap starts, and a second tap stops. The transcript lands in the text box to read and fix before Add note.
- **Plan ready:** the planner intake calls `ideas/plan-ready` after a plan it opened from the Ideas card (`source: 'ideas'`) lands. One push per rollout tag.
- Analytics: `idea_added`, `chime_in_requested`, `chime_in_link_shared`, `ideas_plan_drafted`; planner `source` gained `ideas`.

## Verified
Type-check, the new unit tests, the email tests and the guards. Not rendered in a browser and nothing run against a real database.

## Manual pass
Manager: create a rollout, hold the mic, add a note, tick a teammate, Ask to chime in (push + email arrive), Add someone, share on WhatsApp, open the link in another browser, join, land on the rollout's "Chime in on" card, add a note (owner gets push + email), then Draft with AI (notes in the last question) and check the plan-ready push. Solo artist with no team: Draft with AI leads and the invite card shows.
