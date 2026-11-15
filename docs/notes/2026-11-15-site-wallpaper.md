# Marketing site wallpaper (2026-11-15, #1325)

Founder approved the mock (`docs/mocks/site-wallpaper/`): the app's own pictures sit behind every page of urganize.app, fill the screen and stay still while the page scrolls, as in the app (#1305, #1322).

- **Which picture.** The sun and moon button picks it: sun shows the forest (stored as `light`), moon the night sky (`dark`), under the same `urganize.theme` key as before. With nothing stored, the visitor's clock decides: forest from 05:00 to 17:59, night sky otherwise. The rule is `lib/theme.ts` and, in plain JavaScript, the pre-paint script in `app/layout.tsx`; change both together. When the app gets its morning picture (#1320), the site can use it the same way.
- **The site is always dark over the picture.** Both pictures are dark, so `data-marketing-theme` is always `dark` now and the old light look is not reachable. Product stills that switch on the theme always show their dark version.
- **CSS** is the "The wallpaper" block at the end of `app/globals.css`: the fixed `html::before` layer with its dimming gradient, page grounds see-through (the `.home-v2` wrapper sets its own `--marketing-bg`, so it is listed too), cards as dark glass, the header blurring the picture, and the hero's painted sky turned off.
- **Pictures** are copies of the app's (`apps/homepage/public/images/wallpapers/`), from Unsplash; sources are in PR #1311.
- The homepage's app window (hero loop) was redrawn to the current app in the same change; see `2026-11-01-hero-loop.md`.
