# Onboarding: account, team, then the first project (2026-10-29, #854, no flag)

Built from the approved mocks in `docs/mocks/onboarding-team/` (spec.md, mock.html, design-direction.md). Founder decisions of 29 Oct: "Team" everywhere, the card says "New project", unfinished music is a record in the making, Ready and Already out are rollouts, a joined Manager's project belongs to the team they picked, the paywall moves after the first project.

## The flow

- **S1 Create your account** (`/onboarding`, signed out): Google or name, email, password. Nothing asked before the account, so the Google round trip just lands back on `/onboarding` signed in. Referral code behind "Have a referral code?". Closed sign-up and email confirmation as before (`InviteOnlyNotice`, `CheckInbox`; the confirm link goes through `/auth/callback`, which now sends any un-onboarded account with no work to `/onboarding?setup=1`).
- **S2 Your team**: `GET /api/onboarding/team-state` (read only, never claims or provisions). Invites to this email (pending rows, plus memberships the app already claimed by itself) show as Join cards first. Otherwise Set up your team: name prefilled "{First name}'s Team", "Who is this team for?" (artist, manager, label → persona `independent_artist`, `music_manager`, `label_ar`, which sets `profiles.role` and the trial sheet's plan).
- **S3 Ask to be invited**: WhatsApp first, Copy message, their email, a pasted link, and a check every 20 s while visible (2 min after 30 min). An invite turns the screen into a Join card.
- **S4 New project**: stage first. `lib/onboarding-flow.ts` holds the rules (`musicSavesAs`, `describeMusicBlocker`, `buildMusicSubmission`). Early stages → `POST /api/onboarding/music` (artist found or added in the team, `next_records` row, one `record_songs` row). Ready / Already out → `POST /api/releases` with `workspaceId`, `source: onboarding`, `autoPlan.readyToday: ['master']`. Already out with no exact day is dated by planner v2's `outReleaseDate`.
- **S5**: the record page, or the rollout (auto-plan with a date; the planner hand-off with `musicStage: 'finished'` without one). The trial sheet (`components/onboarding/OnboardingTrialSheet.tsx`, mounted in AppShell) opens once at the moment `decideTrialSheet` picks, never over the planner's questions, never for someone who joined another team, no prices in the iPhone app. "How did you hear about Urganize?" sits above the auto-plan build (`OnboardingHeardFromRow`).

## The server bug (fixed)

`POST /api/releases` always made the artist in the caller's own team (`ensureOwnedWorkspace`) and owned the rollout as the caller. Rollouts are seen by owner id, so a Manager who joined a team and added a rollout put it in their own empty team: the owner never saw it, and owning a rollout flipped the Manager's primary team to the empty one. `lib/release-team.ts` now decides: the team named in the body, else the primary team; in a team someone else owns, the rollout and a new artist are owned by that team's owner. Viewers are refused when they name the team.

**Tightened in review (29 Oct):** only a Manager (owner or admin, active membership) puts a rollout in a team someone else owns; Team members and Viewers keep the old path in the app and are refused when they name a team. With no team named, a picked artist's team decides before the primary team, and an artist from a different team than the one named is refused. A Manager scoped to one artist adds only for that artist. Because a team rollout is owned by the team's owner, the planner (`loadOwnedRelease`), planner v2's two `releases` writes and the onboarding auto build now use the rollout's owner and let the team's Managers in (`canPlanRelease`); before this, a Manager's own new rollout answered "Rollout not found" in the planner and its auto plan never ran. **Still owner-only:** renaming, re-dating through `/schedule`, archiving and moving a rollout (`ensureReleaseOwnership`), as for every team rollout before #854.

Also from review: onboarding matches invites with an escaped ILIKE (an unescaped `_` let "j_hn@" join john@'s invite), the artist scope is checked before an artist can be added, and the onboarding analytics helpers never throw on blocked storage.

## Traps

- The record page reads the person's primary team. A record saved into a team that is not their primary lands on Home instead.
- With `NEXT_PUBLIC_FEATURE_ROLLOUT_IDEAS` on, a no-date rollout opens on the idea card, not the planner; the trial sheet then waits for a build or 60 s.
- `onboarding_step`: 1 account, 2 team decided, 3 done. The onboarding GET still resets the step from the persona, which agrees.
- Not checked live: the dev server uses the production Supabase, so no account was made. Screens were checked at 375 px and desktop in a throwaway page with fake data (deleted).
