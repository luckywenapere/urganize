# The trial sheet asks who the team is for (2026-11-27, v1.298.0, #1424, no flag)

Oyin picked the three rows ("Big rows") of `docs/mocks/trial-sheet-who-for-1424/mock.html` on 27 Nov. It follows the sign-up change of the same day (`2026-11-27-sign-up-straight-to-the-first-project.md`, #1412): sign-up no longer asks who the team is for, and the plan shown first is Solo when nobody said.

## Why

Measured on production, read-only, 27 Nov (our own accounts left out):

- Of the 16 new accounts that said who they are since 29 Oct: 8 artists, 5 labels, 3 managers. So Solo is right for half and too small for half.
- Team size cannot tell them apart in the first days: 21 of 22 new teams had one person, and 14 of the 15 manager or label teams had one artist or none.

## What it does

- "Your 3-day trial is on" (`components/onboarding/OnboardingTrialSheet.tsx`) shows "Who is this team for?" and three rows above the plan card: "Just me, I'm the artist", "Artists I manage", "A label". The words and the rows are the old team form's. `WhoForRows` in `OnboardingFrame.tsx` draws them for both.
- A tap changes the plan on the sheet at once (`trialSheetPlan`: artist Solo, manager or label Pro) and saves the answer as `onboarding_persona` through `PATCH /api/user/onboarding`, the call the "Who are you?" card on Home makes. The account's role is not changed, on purpose: setting it to `artist` after the fact would make the app ask for an artist name they already typed.
- No tap leaves Solo. "Keep going" always works.
- `shouldAskWhoFor` (`lib/onboarding-landing.ts`, tested) decides when to ask: only when there is no answer on the landing or the profile, and never in the iPhone app (the sheet shows no plan there). After a tap the rows stay, so the answer can be changed.
- Once saved, the profile is re-read, so the plan wall shows the same plan later and the card on Home does not ask again.
- New event: `onboarding_trial_sheet_answered` (`who_for`, `tier_shown`, `saved`). `onboarding_trial_sheet_viewed` now fires once per sheet; before, it would have fired again when the plan changed.

## Traps

- **The three answers live in `lib/team-who-for.ts`**, not in `lib/onboarding-flow.ts` (which re-exports them). The trial sheet is in the app shell on every page; importing from the onboarding rule book would load it, and the planner's date rules behind it, everywhere.
- **Saves run one after the other** (`saveChainRef`), so a second tap is never overtaken by the first one's request.
- **"See all plans" gives a fresh answer a moment to save** before it opens the plan wall, because the wall reads the answer from the server. Never longer than 1.5 seconds (`SAVE_WAIT_MS`), so the button does not feel dead on bad data.
- **The sheet keeps the landing it opened with.** The saved landing is cleared the moment the sheet is seen; a re-read while it is open would drop who the team is for and change the plan under the reader.
- **A failed save is silent.** The plan on the sheet still follows the tap, `saved: false` goes to analytics, and the card on Home asks later.
- **The sheet opens about 45 seconds after the first plan lands** on a dated rollout (44 s and 45 s in two runs): the plan-landed event did not fire in those runs, so the 45-second fallback opened it. Not changed here.
- No loading state: the sheet opens already drawn, so there is no skeleton for it.

## Checked

On the local test app (`pnpm dev:local`, never production), phone size: the sheet opened with the three rows and Solo; "Artists I manage" and "A label" changed the plan to Pro and read back as `music_manager` and `label_ar`; "Just me, I'm the artist" changed it back to Solo and read back as `independent_artist`; "Keep going" closed it. The sheet is 596 px tall on a 390 by 780 screen, the same as the mock. The stand-in team form still draws the same rows.

Not checked: the iPhone app, and production.
