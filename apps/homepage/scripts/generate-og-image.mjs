// Regenerate the social share card.
//
//   node apps/homepage/scripts/generate-og-image.mjs
//
// WHY THIS SCRIPT EXISTS. The card is a static PNG at public/opengraph-image.png
// (deliberately NOT the app/opengraph-image.png file convention — see the URG-118
// note in lib/seo.ts for why an absolute URL to a stable public asset is the
// only thing social crawlers reliably fetch). Static was the right call and it
// left the card with no source: CLAUDE.md recorded "a new card needs a
// founder-approved line and a SHARE_IMAGE_VERSION bump, no template for it
// exists in the repo" as an open item for three weeks. This is the template.
//
// It writes the SAME bytes to both apps, because both reference
// `/opengraph-image.png` on their own origin and a card that disagreed between
// urganize.app and app.urganize.app would be a worse bug than a stale one.
//
// AFTER RUNNING IT, TWO THINGS MUST MOVE WITH THE IMAGE or the change is only
// half applied:
//   1. `SHARE_IMAGE_VERSION` in lib/seo.ts. X and other platforms cache bytes
//      per URL and do not reliably refetch on a silent file swap (URG-156).
//   2. `SHARE_IMAGE.alt` in the same file, which is the only machine-readable
//      record of what this image says. apps/web/lib/positioning-guard.test.ts
//      reads that string, so a regeneration that skipped it fails the build.
//
// Fonts are read from apps/web/assets/fonts, which already checks in the real
// brand faces for the recap card. This is a dev-time script rather than shipped
// code, so reaching across the workspace is cheaper than a second copy of two
// font binaries.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';

// `import { ImageResponse } from 'next/og'` fails under ESM here: next's
// exports map does not declare that subpath for it, so Node reports
// ERR_MODULE_NOT_FOUND against the pnpm symlink. CommonJS resolution finds it,
// so resolve the real file and import that.
const require = createRequire(import.meta.url);
const { ImageResponse } = await import(pathToFileURL(require.resolve('next/og')).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const HOMEPAGE = join(HERE, '..');
const WEB = join(HOMEPAGE, '..', 'web');

// Urganize Brand Bible (URG 001), and the three colours the brief names.
const INK = '#0D120E';
const CREAM = '#F5F0E6';
const SPRING = '#7FD99A';

// Kept in step with lib/positioning.ts by hand, because this script runs
// outside the TypeScript build and cannot import it. The guard on the alt text
// is what catches a divergence: change the line here and lib/seo.ts's alt has
// to change too, and that one is compared against the shared constants.
const MAIN_LINE = 'AI Music Business Manager for artists, managers and labels.';
const ACCENT = 'AI Music Business Manager';
const SUB_LINE = 'Plan, organize and execute rollouts from one place.';

const font = (file) => readFileSync(join(WEB, 'assets', 'fonts', file));
const logo = readFileSync(join(HOMEPAGE, 'public', 'images', 'urganize-logo.png'));

// The accent falls on the category, so the line is split rather than styled as
// one run: everything after the category stays cream.
const rest = MAIN_LINE.slice(ACCENT.length);

const card = h(
  'div',
  {
    style: {
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: INK,
      padding: '76px 84px',
    },
  },
  h('img', {
    src: `data:image/png;base64,${logo.toString('base64')}`,
    // 1011x231 intrinsic, so this height keeps the wordmark's own proportions.
    width: 158,
    height: 36,
  }),
  h(
    'div',
    { style: { display: 'flex', flexDirection: 'column' } },
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          fontFamily: 'Fraunces',
          fontSize: '68px',
          lineHeight: 1.08,
          letterSpacing: '-0.02em',
          color: CREAM,
        },
      },
      h('span', { style: { color: SPRING } }, ACCENT),
      h('span', null, rest),
    ),
    h(
      'div',
      {
        style: {
          marginTop: '28px',
          fontFamily: 'Space Grotesk',
          fontSize: '30px',
          lineHeight: 1.4,
          // Cream, stepped back so the main line stays the first thing read.
          color: 'rgba(245, 240, 230, 0.72)',
        },
      },
      SUB_LINE,
    ),
  ),
);

const image = new ImageResponse(card, {
  width: 1200,
  height: 630,
  fonts: [
    { name: 'Fraunces', data: font('Fraunces144pt-SemiBold.ttf'), weight: 600, style: 'normal' },
    { name: 'Space Grotesk', data: font('SpaceGrotesk-Regular.ttf'), weight: 400, style: 'normal' },
  ],
});

const png = Buffer.from(await image.arrayBuffer());

for (const target of [
  join(HOMEPAGE, 'public', 'opengraph-image.png'),
  join(WEB, 'public', 'opengraph-image.png'),
]) {
  writeFileSync(target, png);
  console.log(`[og] wrote ${png.length} bytes to ${target}`);
}

console.log('[og] now bump SHARE_IMAGE_VERSION and SHARE_IMAGE.alt in apps/homepage/lib/seo.ts');
