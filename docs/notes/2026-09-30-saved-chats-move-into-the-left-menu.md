# Saved chats move into the left menu (2026-09-30, v1.52.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder, with a screenshot of the left menu and a green line under the nav rows:
put the chat history there, the way Cursor places it. **This supersedes the
"xl+ chats column" in "Saved UrgAns chats" above**, which described a separate
256px column beside the conversation; that column is deleted. Everything else
in that section (the save engine, resume, conflicts, the panel variant) is
unchanged. No migration, no new flag: it rides `NEXT_PUBLIC_FEATURE_URGANS_HISTORY`.

- **Where it shows.** On `/dashboard/urgans` only, in the free space between the
  nav rows and the pinned Admin/Settings group of `WorkspaceIdentityPanel`, under
  its own top divider. The nav rows keep their natural height and only shrink,
  and scroll, on a viewport too short for both; the list takes what is left and
  scrolls inside itself, so Admin and Settings stay pinned. Elsewhere the menu
  is exactly what it was.
- **One rule, one file.** `lib/chats-menu.ts` decides whether the menu carries
  the list (history on, the menu's own two flags on, the menu expanded). The
  menu, the page and the page skeleton all read it, so they cannot disagree.
- **The 64px icon rail has no room for a list**, so collapsing the menu hands
  chats back to the page: its own "Chats" toggle shows again. The toggle is
  `lg:hidden` while the menu carries the list, and shows at every width when it
  does not (menu flag off, menu collapsed, or below lg where the menu is hidden).
  The panel it opens uses the same rule, so a phone still has its way in.
- **`ChappiHistoryList` has a `menu` variant** (replacing `column`): one compact
  line per chat like the nav rows, the age moved into the tooltip, an icon-only
  new-chat button, and delete on hover. The `panel` variant is untouched.
- **Loaded on demand.** The menu is mounted app-wide, so the list is a
  `next/dynamic` client-only import shown only on the assistant page, with
  loading rows in the meantime.
- **The skeleton no longer reserves a column.** `ChappiPageSkeleton` lost its
  chats column; the menu is chrome with its own placeholder.

Verified: type-check clean (apart from the documented pre-existing errors), lint
clean on every touched file, the chat tests green, and the list rendered in a
throwaway harness page (deleted) inside a mock of the menu. **Not verified: the
real menu on the real page with a real account and real saved chats, at the
collapsed state, or on a phone.**
