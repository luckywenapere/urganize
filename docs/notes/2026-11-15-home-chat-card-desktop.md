# Home on a computer: the chat card (2026-11-15, #1295, part of #1175, no flag)

Oyin approved the mock `docs/mocks/home-chat-desktop/mock.html` (version 2, eleven numbered notes). Computer only: phones keep `HomeAskBar` at the bottom of Home, unchanged.

## Where it lives

- `components/home-desktop/HomeChatCard.tsx`: the card and its skeleton. Drawn by `HomeDesktop` as the `next_drop` block, so it replaced the Next drop banner and takes its place in a saved layout. With the Assistant off (`isChappiEnabled()` false) the block is the old banner again.
- `lib/home-desktop/chat-card.ts` (tested): the greeting and day line, the "About" list and its default, and the suggestions.
- The default Home now leads with it: `next_drop` moved above `out_now` in `DEFAULT_HOME_LAYOUT` (the mock draws the card first). People who saved their own layout keep their order.
- The separate "Ask the Assistant" block under "Add to Home" (it opened the drawer) is gone. `readLayout` drops the `ask` id from old saves.

## How sending works

The same hand-off the phone's box and the rollout pages' box use, no second path: put the chat it belongs to on screen (`showRolloutSession(id)` for a rollout, `showMain()` for Everything), then `setInput`, `setPendingAttachments`, `setScopedReleaseId`, `setSendInputOnOpen(true)`, `markArrivingFromHome()`, and `router.push(assistantHref(id))`. The Assistant's conversation sends it as it mounts. Suggestions about one rollout (late, status update) go to that rollout's chat; the others to the person's own chat.

The box text is the card's own state, not `useChappiStore.input`, so Home shows an empty box when the person comes back. Enter sends, Shift and Enter is a new line, never mid-composition.

## The rules

- **Greeting:** the phone Home's hours (`greetingForHour`): "Sunday evening" over "Good evening, Oyin." With no name it ends "Good evening."
- **About:** Everything first, then rollouts: dated ones not yet out by nearest drop, then no date yet, then ones already out, newest first. Starts on Everything, or on the only rollout when there is one. A disclosure (`aria-expanded`, a `role="group"` panel, `aria-current` and a tick on the chosen row), Escape or a click outside closes it.
- **Suggestions**, each hidden when its data is missing: what is late on the rollout with most late tasks; "What should I do today?" when anything is in flight; plan the next record for an artist with nothing planned (quiet before just out); a status update for the nearest dated rollout's artist (a two-word name reads as the first name, as the mock).
- **Next drop panel:** `list.spotlight` (the dated rollout that drops soonest). With none, "Nothing is dated yet" and one line.

## Not in it

- `HomePageClient`, `ManagerMidReleaseView` and `components/loading/HomeSkeleton.tsx` are untouched: `/dashboard/home` redirects to `/dashboard`, and on a computer `/dashboard` is `HomeDesktop`. Neither ever drew the phone box on a computer.
- No voice button on a computer (the phone box's mic is hold to talk, phone only).
