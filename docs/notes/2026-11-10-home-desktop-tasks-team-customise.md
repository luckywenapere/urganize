# Home on a computer: tighter, with tasks, your team and Customise Home (2026-11-10, #1182, no flag)

Part of the screen-by-screen design review (#1175). Oyin approved the mock with "Yes, build it": `docs/mocks/home-tighter/mock.html` (two frames and nine numbered notes).

## Computer only

`app/dashboard/artists/ArtistsPageClient.tsx` mounts `components/home-desktop/HomeDesktop.tsx` at `lg` and up (`useIsDesktopViewport`). Phones, narrow windows and the swipe navigation keep the list they had: Oyin said "mobile design is another logic". A team with no artists still gets the old first-page empty state at every width. An artist-role viewer still sees their own artist page as Home.

The pieces both layouts share (the cover, the Next drop banner, the date helpers) moved unchanged to `components/artists/ArtistListParts.tsx`.

## What Home shows

One content width, 1120 (`HOME_DESKTOP_WIDTH`, an inner wrapper as `WorkspaceFrame` requires). Blocks, in the default order:

1. **Out now**: one line per song (`OutNowCards variant="line"`), the action is a link. Same states and rules as the card (#1086, #1090); the card is still used on phones and the artist page.
2. **Next drop**: unchanged.
3. **My tasks** and **Delegated**, side by side. Rules in `lib/home-desktop/tasks.ts` (tested):
   - My tasks: open tasks assigned to the viewer, from the task store (so only what the viewer can already see). Late first, oldest first, then soonest, then no date. Top 5, with the full count in the head. Ticked through `TaskCompletionCheckbox`, the same path every list uses, so blockers and the unlock of waiting tasks apply. A blocker shows as a line in the card.
   - Delegated: open tasks someone else holds that the viewer made, or that sit on a rollout the viewer owns (`releases.ownerUserId`). A plan's own tasks are made by the planner, so "made by" alone would miss most of an owner's delegating. Spare rows show what was finished today, struck through, "Done today"; finished work never pushes out open work.
   - **See all**: there is no tasks page (`/dashboard/tasks` redirects to Home). My tasks opens the Team page with your own panel open (all your open tasks, grouped Late / This week / Later). Delegated opens the Team page.
4. **Your team**: one row of up to five tiles from `GET /api/team` (`components/team/useTeamPage.ts`, the Team page's own read and in-memory copy). You first, then the Team page's order. Role, open and late counts are the Team page's numbers. More people than fit: a "N more" tile. "Invite someone" with seats left only for someone who may invite and has a seat. A person links to `/dashboard/team?person=<member id>`; invite links to `/dashboard/team?invite=1`. `TeamPageClient` reads both once.
5. **Your artists**: sorted soonest drop first (`sortBySoonestDrop` in `lib/artists-list.ts`: dated, then no date, then out, then quiet). The Drops column is back on a computer (it left Home on 2026-11-06; the approved mock returns it). Late is one red number, not a pill. "Add artist" in the head and an "Add an artist" row at the bottom, both `openAddArtist`.
6. **Ask the Assistant** (removed 2026-11-15, #1295: the chat card replaced it, see 2026-11-15-home-chat-card-desktop.md): off by default, under "Add to Home". It is a box only: sending opens the Assistant's drawer with the question in it, the same as "Ask AI" in the search bar. Home on a computer still mounts no conversation (`home-desktop-chat-guard`). The mock said "and its suggestions"; there is no suggestions list in the app today, so none are shown.

## Customise Home

`components/home-desktop/HomeCustomise.tsx`, rules in `lib/home-desktop/layout.ts` (tested). Drag to reorder (native drag), Remove, "Add to Home", Reset, Done. Nothing saves until Done.

- **Keyboard**: each block's handle is a button; arrow keys move it one place, Home and End send it to the top or bottom, and each change is read out through a live region. The list is one flat grid keyed by block so focus stays on the block while it moves.
- **Your artists cannot be removed**, so Home is never empty. `readLayout` puts it back even if a save lost it.
- **Saved per user, not per team**, in `ui_state_drafts` (scope `home`, key `home-layout`) through the existing `/api/ui-drafts` route, which had no callers. **No migration was needed.** The default layout stores no row (Reset deletes it), so a later change to the default reaches everyone who never customised.
- A block the saved layout never mentions (one added to the app later) lands where the default puts it, instead of being hidden.
- `stores/useHomeLayoutStore.ts` fails open to the default and registers a sign-out reset (`home-layout`).

## Traps

- The two task cards share a row only when they are neighbours in the order (`layoutRows`); alone, a card is full width.
- Out now and Next drop draw nothing when there is nothing to show, in any position.
- Team counts come from the primary team only (the Team page's rule), while My tasks reads every rollout the viewer can see, so the two "open" numbers can differ for someone on two teams.
- `/api/ui-drafts` sits behind the paid-access check like most routes. A locked account never reaches Home, so this does not matter there.

## My tasks is the short list, not every plan task (2026-11-11, #1206)

A plan assigns every task it makes to the rollout's owner (`lib/release-templates/instantiate.ts`), so "assigned to me" was the whole plan: the owner of ten rollouts saw "423 open", all made by plans, 153 of them on songs already out. `focusMyTasks` in `lib/home-desktop/tasks.ts` (tested) now holds My tasks to:

1. each rollout's short main list (`selectKeyTaskIds` in `lib/plan-focus.ts`, the same few tasks the rollout plan opens on, plus anything a person wrote by hand), picked from the whole rollout and then kept only where the viewer holds it;
2. nothing that was due before a song that is already out.

The viewer's own tile in Your team shows the same open and late numbers, so Home never shows two counts for one person. The Team page still counts every task a person holds, and "See all" still opens that full list. Delegated is unchanged: a task someone else holds was handed out on purpose.

## Not verified

See the pull request for what was and was not checked in a browser.
