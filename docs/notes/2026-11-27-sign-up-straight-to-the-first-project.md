# Sign-up goes straight to the first project (2026-11-27, v1.297.0, #1412 and #1415, no flag)

Oyin approved Option A of `docs/mocks/first-rollout-1412/mock.html` (round 2) on 27 Nov. Why: of the 16 real accounts made from 3 to 26 Nov, 3 stopped on "Set up your team", none picked a release day, and only 2 have a plan. The walkthrough, the numbers and the screens are in issue #1412. Rule for the mock: keep the screens as they are and change only what a number asks for, so nothing here is a new screen, button or card.

## What changed

1. **Email sign-up works (#1415).** `isEmailLetIn` (`lib/access-gate-server.ts`), which `POST /api/access/check` asks before the form makes the account, never read `SIGNUP_OPEN`. From 8 to 27 Nov a person with no invite who typed an email and a password read "Urganize is invite-only for now", while Google (which never asks) worked. It now answers yes for every email while sign-up is open. `lib/access-gate-agreement.test.ts` holds it to the same answer as the gate (`decideAppAccess`), with the real constant.
2. **No team step.** `decideOnboardingScreen` (`lib/onboarding-flow.ts`) answers `make_team` where it answered `setup`. The page (`makeTeam` in `app/onboarding/OnboardingPageClient.tsx`) posts `{ action: 'create', auto: true }` to `/api/onboarding/team`; `createOnboardingTeam` with `whoFor: null` finds or makes the team, names it "{First name}'s Team" and writes nothing to the profile. The name is only written over the system name ("{email handle}'s Team", `isSystemTeamName`) or none: a name somebody chose stays. The answer carries the team state, so the project screen opens without another read. Then `onboarding_team_created` fires with `who_for: 'not_asked'`.
3. **A release day is already picked.** The project form opens on `defaultMusicForm(today)`: "Pick a day" on, the day 8 weeks out (`DEFAULT_RELEASE_LEAD_DAYS`, 56, where the single plan starts; a test holds it to the template). It only counts for Ready to release. "No date yet" is still one tap.
4. **The heading.** "Nothing here yet." is "What are you working on?" (`NEW_PROJECT_HEADING`), and the line under it is "Add it to {team}, or ask someone to invite you." The "Team" back link above the heading is gone, and device Back holds the page as it does on the team screens.
5. **The loading screen** between the account and the project screen (`TeamLoadingScreen`) is that screen's skeleton: the same heading, the still (`FirstProjectStillSkeleton`), the cards (`NewProjectCardsSkeleton`) and the account row. The "Opening Urganize" hand-off keeps its small card.

## Who the team is for

Nobody is asked during sign-up any more. `onboarding_persona` stays empty, so:

- `profiles.role` stays `artist-manager` (the sign-up default), as it always has for a Google sign-in from `/auth`.
- **The plan shown first is Solo when nobody said** (Oyin, 27 Nov; it was the team plan, a founder call of 14 Oct). `trialSheetTier` (the trial sheet, and `/add-card` for a card trial abroad) and `paywallTierForPersona` (the plan wall, through `pickWallPlan`) both answer Solo for no answer. An answer still decides: a manager, a label or "other" starts on Pro. The wall moves a no-answer team up when it no longer fits (a second artist, a fourth person, a second rollout in progress).
- Home's "Who are you?" card (`components/home/PersonaAskCard.tsx`) asks once. It never shows in the first session, so someone who opens the app on one day only is never asked. The admin persona split will have more accounts with no answer than before.

## Traps

- **The automatic team has no marker.** `teamDecided` still means "a persona is set and they own a team", so an account that reloads before adding anything gets `make_team` again. That is on purpose: the call is safe to repeat (it writes nothing the second time), and an invite that lands in between shows as a Join card on the next visit. Do not use `onboarding_step` as a marker: `GET /api/user/onboarding` resets it to 1 while there is no persona.
- **"Set up your team" is still in the code** (`SetupTeamScreen`), as a stand-in. It shows when the invite check fails, when it has taken over 15 seconds (`TEAM_CHECK_TIMEOUT_MS`, was 6 while the form was the next step anyway), or when the automatic team could not be made (`onboarding_team_viewed` with state `make_failed`). A late answer is followed (`shouldFollowLateTeamAnswer`) unless the person has typed or picked on the form; an invite always wins. Making the team by hand there still asks who it is for.
- **The ask screen has two exits now** (`decideAskBack`, `decideOwnTeam`). Back returns to the screen it was opened from. "Create my own team instead" makes the team. Before, both opened the team screen.
- **"Solo when nobody said" reaches older accounts too.** On 27 Nov, 74 real teams from before had no answer; 73 of them fit a one-artist plan, so the wall now leads with Solo for them where it led with Pro. In the first days a team's size says almost nothing (14 of 15 manager or label teams had one artist or none), so until the question is asked again nearly everyone with no answer sees Solo. The trial sheet now asks "Who is this team for?" with one tap (#1424, `2026-11-27-trial-sheet-who-for.md`), which is how a new person gets the right plan.
- **Numbers shift from this deploy.** Every new account gets a team and its trial clock at once, where accounts that stopped on the team screen got none. The scoreboard's trial-to-paid share has more teams under the line, and `onboarding_team_viewed` no longer fires on the normal path.
- **A person who really is joining someone's team gets a team of their own first**, because the team is made before they can tap "ask someone to invite you". When they join, the joined team is their primary one (the rule in `lib/tasks-server.ts`: your own, unless you own no rollouts and joined someone else's). Their own team's trial runs out unused.
- The 8 weeks is the same for an EP and an album, whose plans start earlier (13 and 17 weeks). The planner squeezes them, as it does for anyone who picks a near date.

## Not built

The email to people who stop before adding music (the add-on in the mock). The words need Oyin's yes first.

## Checked

Vitest covers the rules (`onboarding-flow.test.ts`, `onboarding-team-auto.test.ts`, `access-gate-server.test.ts`, `access-gate-agreement.test.ts`). The flow was walked on the local test app (`pnpm dev:local`, never production) on a phone-size screen and a computer: see the PR.
