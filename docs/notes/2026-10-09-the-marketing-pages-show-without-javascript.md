# The marketing pages show without JavaScript (2026-10-09, no flag)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Found by the marketing polish loop (`notes/marketing-log.md` keeps its running log): `.scroll-reveal` started at `opacity: 0` in CSS and only the `IntersectionObserver` in `ScrollReveal.tsx` ever showed a section. With scripts off, blocked or not yet loaded, the homepage was the hero, the logo strip and then about 6,500px of blank screen, and the waitlist form (the last block, and the only sign-up path from the site) was invisible; `/features` lost about 1,700px.

- **Visible by default; armed by script.** `ScrollReveal` sets `data-reveal="armed"` on a section only once it has run in the browser and only when that section is wholly below the fold (`getBoundingClientRect().top >= innerHeight`). The CSS hides `.scroll-reveal[data-reveal="armed"]:not(.is-visible)`. A section already on screen, or already scrolled past (a reload that restored the scroll position, `/#waitlist`), is never hidden, so there is no flash.
- **Do not put the hidden state back on the base `.scroll-reveal` rule.** It is the whole bug.
- Marketing-site only, so no changelog entry and no version bump (the app-only scope rule above).
- **Verified:** JS off, JS blocked at the network, and JS on (all eight sections start hidden below the fold and show after scrolling), plus `/#waitlist` with the six sections above it staying shown. Homepage lint and build, and the positioning and copy guard tests in `apps/web`, pass. **Not verified:** a real slow Lagos connection, and a mobile Safari; the check is a headless Chromium with the network blocked.
