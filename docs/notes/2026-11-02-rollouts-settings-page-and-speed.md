# Rollouts, Settings as a page, tab memory and the speed pass (2026-11-01 to 11-02, v1.234.1 to v1.243.0, no flags)

All founder approved from mocks in `docs/mocks/` (account-menu, sessions, settings-page, settings-rows, desktop-nav). Every item shipped as its own reviewed PR (#1018 to #1043). Nothing here was looked at in a browser by the session that built it; unit tests and `tsc` only.

## Navigation

- **Swipe row (phone, `lib/swipe-nav.ts`)**: tabs are Home (`artists` key), Assistant (`urgans`), Rollouts (`sessions` key, `/dashboard/sessions`). `SWIPE_PAGES` adds a fourth, unlabelled page, Settings (`settings` key, `SETTINGS_PAGE_HREF = /dashboard/account`). `SWIPE_TABS` is still the three labelled tabs; the pager uses `SWIPE_PAGES`.
- **Settings is entered only by tapping the photo.** `reach(index)` in `SwipePager` stops a swipe from Rollouts going on to Settings; from Settings a right swipe slides out and `settle()` closes it (`useSettingsPageStore.open = false`).
- **Classic menu and computer (`lib/shell-nav.ts`)**: the `team` area became `rollouts` (`ROLLOUT_CHATS_HREF`). `ShellAreaKey` still has `team` for old state; no area uses it. The Team page (`/dashboard/team`) is reached from Settings and lights no menu item.
- **Artist's own Home (`lib/artist-home.ts`)**: an account that is the artist (solo artist view) with exactly one artist sees that artist's page as Home, no back arrow.

## Rollouts (one chat per rollout)

- **Id rule (`lib/rollout-session.ts`)**: the chat id is a deterministic v5-shaped uuid from the person and the rollout, the way Home's chat uses the user id. No migration. Private per person.
- **`showRolloutSession(releaseId)`** in `useChappiHistoryStore` opens or starts it. There is ONE chat store, so a chat is drawn only on the tab on screen; Assistant re-shows Main on every arrival and clears the rollout pin (`useSessionsViewStore.pinnedScope`).
- **Handoff**: the box on a rollout page sends to that rollout's chat, opens Rollouts and shows a 6s "Back to <rollout>" pill (`BackPill`). The shared box waits for the chat to load (`whenSessionReady`).
- **Computer**: `/dashboard/sessions` renders `SessionsPane split` (list left, chat right with its own box).
- **Read-ahead**: the list prefetches the three most recent chats (`prefetchChat`, one use, same account, 60s, max 5, never on Data Saver or a slow link).

## Ideas through the chat

- **Tool `add_rollout_idea`** (auto, not on MCP) posts to `/api/releases/:id/ideas` and returns `open_ideas` (with `suggest`) so `ChappiIdeasCard` eases in under the reply: ideas, who should chime in, Close and write the brief. On a rollout that already has a plan it shows suggested plan changes instead (owner only).
- The record panel, voice loop and "or type it" box left the idea card; a fresh rollout says "Tell UrgAns in the chat box below". Add idea and Edit idea left the brief card. **Still there:** the small "Add idea" button in the Work-the-plan header opens the old typed box.
- Editing an earlier idea is not possible (no edit route); the tool adds another.

## Settings is a page

- **Every width**: `settingsIsAPage()` is true wherever `canHostSettings`, so `useOpenSettings` and every `?settings=` link (`SettingsModalGate`) open the page. **The pop-up no longer draws.**
- **Phone**: `SettingsPane` is the fourth swipe page. Inside a setting the tabs hide and the pager locks; header is a round back button and a centred title. Search is sticky at the bottom.
- **Computer**: `/dashboard/account` renders `SettingsPane split` (list and search left, setting right, Profile first). The photo in `TopNav` opens it.
- **Rows (`components/shell/swipe/SettingsRows.tsx`)**: Profile (sheet with one field and Save), Notifications (one switch, shared `usePushToggle`), Security & account, UrgAns, Admin (rows that open the existing form in place and stay mounted while folded, so drafts last; a search result's section id opens its row). **Billing and Artists & brand keep their old layout.**
- Settings opened stay mounted while Settings is open (drafts survive the list). Leave team visibility is read from `/api/team`, not the billing snapshot.
- **Cut from Settings**: Guided tours, Role view, Directory profile, Delete rollouts (code kept). Trash has a row in the account list.

## Tabs remember, and the speed pass

- **Home remembers its page (`lib/tab-memory.ts`, `useTabMemoryStore`)**: a rollout or artist page left for another tab reopens when you come back to Home; going back to the list from it forgets. sessionStorage; sign-out clears it by key.
- **Instant reload**: `checkAuth` opens the gate as soon as the local session matches the saved account (same id only); `getUser`, the profile read and the deletion check still run and can sign out. Guarded by `lib/instant-reload-guard.test.ts`.
- **Saved roster**: per account, a day at most (photo links expire), key in `lib/roster-cache.ts`, cleared on sign-out. Known gap: after switching teams the first reload can show the old team's artists until the network answers.
- **Last copy in memory (`lib/last-seen.ts`)**: brief, idea card, Team page, artist records and catalogue paint the last copy seen in this page life, then refresh. Memory only, cleared on sign-out.
- **Task view** reuses the rollout and people lists for 60s, for the same account only.
- **Prefetch list** includes `/dashboard/sessions` and `/dashboard/account`.

## Other fixes in the same days

- iOS keyboard: keyboard counts as open only while a text field is focused (`lib/keyboard-viewport.ts`).
- Brief: no "Write the brief" card until a brief exists; Approve and build the plan floats above the chat box on a phone; approving closes the brief so you land on the plan.
- Photo button: no focus ring left after a tap; keyboard focus outlines the photo.

## Not done

- GitHub tags and Releases for v1.234.1 to v1.243.0: the session's git proxy refused tag pushes (403). The commits are listed in the PRs; tag them by hand.
- No GitHub issue was opened per task, against the repo rule.
