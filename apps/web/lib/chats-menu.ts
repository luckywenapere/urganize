/**
 * Where the saved UrgAns chats live on the assistant page.
 *
 * On a desktop the left menu carries them, in the free space between the nav
 * rows and the pinned Admin/Settings group (the Cursor layout: the chat
 * history sits under the navigation, not in a column of its own). Everywhere
 * the menu cannot carry them, the page keeps its own "Chats" toggle instead.
 *
 * The menu can carry them only when ALL of these hold:
 * - chat history is on,
 * - the menu itself is on (its own flag AND the workspace flag, the same
 *   pair AppShell mounts it under),
 * - the menu is expanded — the 64px icon rail has no room for a list.
 *
 * The menu is also hidden below `lg`; that part is CSS (`lg:hidden` on the
 * toggle), so the phone still has its way in. Pure so the page, the menu and
 * the loading skeleton cannot each work it out differently.
 */
export function chatsLiveInMenu(input: {
  historyOn: boolean;
  menuOn: boolean;
  collapsed: boolean;
}): boolean {
  return input.historyOn && input.menuOn && !input.collapsed;
}

/** The menu's two flags, read once. Module-scope on purpose: `NEXT_PUBLIC_*`
 * is inlined at build time, so this cannot change during a session. */
export const CHATS_MENU_ON =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

/** The assistant page — the only place the menu shows a chat list. */
export const CHATS_MENU_PATH = '/dashboard/urgans';

/** Whether the menu should render the list for this pathname. */
export function menuShowsChats(input: {
  pathname: string | null;
  historyOn: boolean;
  collapsed: boolean;
}): boolean {
  return (
    input.pathname === CHATS_MENU_PATH &&
    chatsLiveInMenu({ historyOn: input.historyOn, menuOn: true, collapsed: input.collapsed })
  );
}
