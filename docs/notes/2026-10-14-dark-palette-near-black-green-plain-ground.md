# Dark palette: near-black + green, plain ground (2026-10-14, URG-256 / URG-257, v1.124.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

From Femi's design review (2026-10-13): the 36px grid and textile weave behind the app overload small text, the all-green palette was monotonous, and every item read at the same strength. Three candidates (orange, green, forest) were previewed behind `?palette` (d5fa928, 37e712c); **the founder picked green on 2026-10-14** and the preview switch, the other two palettes and the `urganize.palette` localStorage key are gone.

- **Tokens, not components.** `:root:not([data-theme='light'])` in `globals.css` redefines the EXISTING dark tokens (rgb triples and the legacy hex set): near-black neutral ground (#0c0c0d family), one accent spring green #7fd99a. Selector specificity (0,2,0) deliberately outranks the later `html[data-theme='dark']` block (0,1,1). The light theme is untouched.
- **Plain ground everywhere.** The base `body::before`/`::after` grid and frame rules are deleted; an unconditional `display: none !important` also switches off the `.urg-textile` versions, the entrance grounds and the top band's brand tint while the textile flag still exists. Deleting the textile layer itself is a separate cleanup.
- **Hierarchy (URG-257) at token level.** `content-secondary` (inactive nav, meta, secondary labels) sits near 60% of primary and `content-tertiary` near 55%, both 4.5:1 on every ground; controls 3:1. Anything already on those tokens got the hierarchy app-wide; components that put meta text on `content-primary` are the remaining follow-up. No shell component was edited (URG-254/255 owns them).
- **Guards:** `lib/text-contrast.test.ts` runs every tier and control check on the green block, plus the accent 4.5:1 on every ground and the button label 4.5:1 on the accent.
