# Home on a computer has no chat (2026-10-27, no flag)

Founder call. Reverses the desktop half of "Home becomes the chat on a computer" (2026-10-07). The phone is unchanged.

- **Computer (lg and up):** Home is one page, centred at `max-w-[920px]`, scrolling with the page, with the same greeting and blocks. A "New rollout" button sits after the last block (it used to come from the chat beside Home). `HomeDesktopSplit`, `useHomeChatStore` and the divider fold with its stored key `urganize.home.list-collapsed` are deleted. `HomeSkeleton` is one column at every width.
- **UrgAns on a computer lives only on `/dashboard/urgans`** (`UrgansSessionsLayout`, since 2026-10-26), reached from the top bar's UrgAns pill. It does not redirect to Home. It carries `data-tour="nav-urgans"`.
- **Routing:** `askUrgansTarget` sends Home on a computer to the UrgAns page (the search bar's "Ask UrgAns" and the `/` shortcut); a phone's Home still fills the pinned box. The drawer's expand opens the UrgAns page, not Home. If no session exists and Home's chat was on screen, the UrgAns page keeps a carried question when it clears.
- **Home's permanent chat** (`lib/chappi/home-chat.ts`) is no longer opened on a computer. It is still not listed among sessions, so a computer no longer reaches it; the swipe navigation (`components/shell/swipe/main-thread.ts`) still opens it.
- **Guards:** `home-desktop-chat-guard` (Home mounts no `ChappiConversation`, no split, New rollout kept, UrgAns page never bounces to Home), `home-layout-guard`, `ask-urgans.test`.
- **Not verified:** no browser pass. The golden One Thing card scales with the column, so at 920px wide it is about 570px tall; worth a look.
