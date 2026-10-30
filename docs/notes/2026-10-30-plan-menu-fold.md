# Plan menu fold (2026-10-30, v1.218.0, #898, no flag)

Founder approved mock: `docs/mocks/plan-menu-fold/mock.html`.

On Work the plan (timeline or list, dated plan, not the simple no-date view), a small move down the page folds the menu away. What folds:

- Computer: the page bar tools (count, view switch, Hide done, Select, Add idea, New activity) via `html[data-plan-menu='folded']` in `globals.css`, the tabs row (WorkspaceDesktopFocused) and the phase cards plus distribution check (TimelineScene). The breadcrumb stays. The Menu pill takes the tabs' place and sticks at 80px, under the 72px top bar.
- Phone: RolloutPhoneHeader swaps the whole header (and its banners) for one slim line (`SlimTitle`: back, title, count) plus the pill, sticky under the swipe top bar. TasksPanel's list search and Group by row fold too, unless a search or filter is on.

Opening: a pull of 70px past the top that started at the top (momentum running into the top does not count), a hard flick down on touch (1.6 px/ms over 40px+, read over the last 100ms), or the pill. On the phone the pill also scrolls to the top, since the header lives there. The wheel has no speed rule on purpose: a mouse wheel sends the same step however hard it spins and trackpad momentum keeps going after the fingers lift.

Pieces: rule `lib/plan-menu-fold.ts` (tested), store `stores/usePlanMenuFold.ts`, passive window listeners `components/workspace/usePlanMenuFoldGestures.ts` (turned on from WorkspaceView; off under the phone search, the rotate prompt, a scene, or a new rollout id, and turning off unfolds), pill `PlanMenuPill.tsx`. Gestures that start in a field, dialog or sheet are ignored.

Thresholds are first guesses, not tuned on a real phone. Verified with simulated wheel and touch in the local app (desktop 1400 wide and mobile 375).

## Fix: the strip above the folded phone header (2026-10-31, v1.225.2)

The folded header stuck at `top: <top bar height>`, but on a phone the swipe top bar scrolls away with a rollout, so the plan showed through a strip above it (founder screenshot). It now sticks at `top: 0` and pads down to where the top bar ends on screen right now (read on scroll), or to the safe area once the bar has gone, and covers the page gutter (`-mx-4 px-4`). Not checked on a real phone.
