# Settings/Admin pin to the base of the card (2026-08-13)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

A founder call on the identity card's nav, layout-only — no flags, no routes, no data.

- **Admin and Settings are pinned to the BASE of the nav, Admin above Settings.** They sit in their own bordered group below the scrolling list of release surfaces and above the collapse control. `WorkspaceNavList` renders two flex children of the `<nav>`: the item list (`min-h-0 flex-1 overflow-y-auto`) and that pinned group. The scroll moved from the `<nav>` onto the item list, so a short viewport clips the release surfaces instead of pushing Admin/Settings off the card. Both are module-level `NavItem` constants (`ADMIN_ITEM`, `SETTINGS_ITEM`) rendered through the same inline `renderRow` closure as everything else, so the collapsed icon-rail treatment, tooltips, `sr-only` labels, and active states can't diverge. Admin stays visibility-gated on `isAdmin` and stays un-reserved in the skeleton (URG-232's reasoning is unchanged) — but because Settings is now below it, an admin's Admin row appears ABOVE an already-placed Settings rather than shifting it.
- Verified: `pnpm lint` (0 errors) + `pnpm build`. Not verified in a browser — the card only renders on authenticated chrome pages at `lg`+.
