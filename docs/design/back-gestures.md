# Back gestures, screen by screen (phone, swipe shell)

Written 2026-10-21 from reading the code. "OS back" = iOS edge swipe / browser Back / Android hardware Back. The iOS app shell turns its own back-forward gestures off (`allowsBackForwardNavigationGestures={false}`), so on iOS the in-page controls are the only Back there.

Overlay Back (sheets, dialogs, pop-ups closing on Back) belongs to another session and is not covered here.

## Rules

1. Tab roots (Home, UrgAns, Artists): swipe switches tabs; tabs `replaceState`, so Back never walks tab history. Android: Home exits, UrgAns/Artists go Home.
2. One level up at a time: scene -> rollout -> where you came from (artist page, Artists tab, Home). Scene-to-scene switches replace by design.
3. Pages opened from the avatar menu go back to where you came from.
4. One-way flows cannot be walked back into a finished step.
5. Public pages and `/admin/*` keep native behaviour.

## Table

| Screen | Before | After | Change |
|---|---|---|---|
| `/dashboard/home`, `/urgans`, `/artists` (tab roots) | Swipe switches tabs, replaceState. Android: Home exits, others replace to Home. | Same | None (verified, `swipe-history-guard.test.ts`) |
| Artist page `/dashboard/artists/[id]` | In-page arrow to Artists (push). iOS/OS Back fine. Android Back jumped Home. | Android Back goes back one level when history exists | `decideAndroidBack(url, canGoBack)` |
| Rollout `/dashboard?release=` | Opened by push from cards/links (good). In-app arrow goes to the catalogue by design (CLAUDE.md, no smart resolver). Android Back jumped Home. | OS Back returns to origin; in-app arrow unchanged; Android Back one level | Android only |
| Scene `?scene=` | Open from closed pushes, switch replaces: OS Back closes to the rollout. Android Back jumped Home. | Same; Android Back now closes it | Android only |
| Directory, Relationships, Opportunities, Press kits (top-bar Back arrow) | Arrow pushed the previous page, so OS Back then returned to the page just left (ping-pong). Deep link: Link pushed Home, same ping-pong. | Arrow goes `history.back()` when this tab came from an in-app page; otherwise `replace`s with Home | `swipeBackAction`, `SwipeTopBar` |
| Person, press kit, credits, notes, tasks, front-desk, cancel | Own back arrows (Link). OS Back fine. Android Back jumped Home. | Android Back one level | Android only |
| `/auth` login success | `router.push(next)`: `/auth` stayed in history and bounces an authenticated user forward (loop). | `replace` | fixed |
| `/payment/callback` | Buttons pushed Home/Billing; Back returned to the success screen. | `replace` | fixed |
| `/welcome/[token]`, `/claim/[token]` exits | Pushed `/dashboard`. | `replace` | fixed |
| `/invite/accept`, `/redeem`, `/start-trial`, `/locked` exits | Already `replace`. | Same | held by `flow-exit-guard.test.ts` |
| `/locked` wall | Entered via `replace`; Android Back goes Home, which the gate sends back to `/locked`: the app behind the wall is never shown. | Same (paywall paths keep go-home) | None |
| `/onboarding` | One history entry: OS Back left onboarding from step 3. | Each question step has its own entry; OS Back goes to the previous step. After the account exists nothing is pushed and Back holds in place. Android Back uses it too. | `lib/onboarding-history.ts` |
| Public pages (`/p`, `/k`, `/pitch`, `/brief`, `/pack`, `/credits`, `/capture`, `/epk`), `/admin/*` | No custom gesture handlers (SwipeFrame only wraps `/dashboard`). | Same | None |

## Not changed, on purpose

- The in-app "Back to catalogue" arrow stays a fixed destination (CLAUDE.md, "The workspace back arrow").
- `nav-history` stays as it is; Settings and the top-bar arrow read it.

## Needs a real phone

See the final report of the pass; the manual checks are listed there.
