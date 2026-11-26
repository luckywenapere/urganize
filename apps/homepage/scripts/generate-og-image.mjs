// Regenerate the social share card.
//
//   node apps/homepage/scripts/generate-og-image.mjs
//
// WHY THIS SCRIPT EXISTS. The card is a static file at public/opengraph-image.jpg
// (deliberately NOT the app/opengraph-image file convention — see the URG-118
// note in lib/seo.ts for why an absolute URL to a stable public asset is the
// only thing social crawlers reliably fetch). This is its source.
//
// It writes the SAME bytes to both apps, because both reference
// `/opengraph-image.jpg` on their own origin and a card that disagreed between
// urganize.app and app.urganize.app would be a worse bug than a stale one.
//
// THE 2026-10-31 CARD (#939, founder approved the mock). Centred, so the logo,
// headline and timeline pill all survive WhatsApp's small square thumbnail,
// which crops the middle 630x630. Logo on top, "From idea / to execution." in
// DM Sans Bold, a cream pill holding a release timeline that ends in a gold
// drop-day diamond, two curved ribbons carrying real plan steps in DM Mono
// that cross behind the pill, all on the homepage dawn (green sky, gold glow)
// with a blurred timeline screenshot and grain behind it.
//
// WHY A BROWSER, NOT next/og. Blur, grain (an SVG noise filter) and text on a
// curved path are beyond Satori, so the card is real HTML screenshotted by
// Chromium through Playwright. Playwright is not a repo dependency: Claude's
// cloud containers have it preinstalled; on a laptop run
// `npx -y playwright@1 install chromium` once and use `NODE_PATH` or a global
// install so `require('playwright')` resolves. Set CHROME_PATH to a Chrome or
// Chromium binary when Playwright's own download is missing.
//
// THE 2026-11-15 CARD (#1299). Same frame, new words: the homepage headline
// "A music career shouldn't run / on a group chat.", ribbons that carry steps
// from more than a release (a show, a pitch, press), and a pill that names
// the idea (one plan, one owner per task) where the drop-day timeline was.
//
// 2026-11-26 (#1405): the pill names the new line, "the operating system for
// your music career", and one ribbon step is about the career, not a release.
//
// WHY A JPEG. The grain makes a PNG about 750 KB, over what WhatsApp will show
// as a large preview. A quality-86 JPEG is about 70 KB and looks the same.
//
// AFTER RUNNING IT, TWO THINGS MUST MOVE WITH THE IMAGE or the change is only
// half applied:
//   1. `SHARE_IMAGE_VERSION` in lib/seo.ts AND `SHARE_IMAGE_VERSION` in
//      apps/web/app/layout.tsx. X, WhatsApp and the rest cache bytes per URL
//      and do not reliably refetch on a silent file swap (URG-156).
//   2. `SHARE_IMAGE.alt` in lib/seo.ts if the words change. It composes from
//      SHARE_HEADLINE in lib/positioning.ts, so change the words there and
//      here together.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('[og] playwright is not installed; see the note at the top of this file.');
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const HOMEPAGE = join(HERE, '..');
const WEB = join(HOMEPAGE, '..', 'web');
const url = (path) => pathToFileURL(path).href;
const FONTS = join(WEB, 'assets', 'fonts');

// Kept in step with HERO_HEADLINE_LEAD and HERO_HEADLINE_ACCENT in
// lib/positioning.ts by hand (SHARE_HEADLINE is the two joined): this script
// runs outside the TypeScript build and cannot import it.
const LINE_ONE = 'A music career shouldn’t run';
const LINE_TWO = 'on a group chat.';

// Real kinds of work a team plans here, a release next to a show, a pitch and
// press, so the ribbons do not say the product is only for releases. Two ribbons, each one long line that runs off both edges.
const RIBBON_ONE =
  'brief the designer on cover art · book the venue for the show · set this year’s career goals · ' +
  'pitch to playlist curators · send the press kit · upload track and metadata ·';
const RIBBON_TWO =
  'choose the distributor · confirm the release date · lock the set list · ' +
  'follow up with the blogs · remind the team on WhatsApp · plan the next one ·';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:YS;src:url(${url(join(FONTS, 'DMSans-Bold.ttf'))})}
@font-face{font-family:SM;src:url(${url(join(FONTS, 'DMMono-Regular.ttf'))})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#0c0c0d}
.card{position:relative;width:1200px;height:630px;overflow:hidden;background:
  radial-gradient(38% 46% at 50% 108%, rgba(233,196,106,.70) 0%, rgba(233,196,106,.22) 40%, rgba(233,196,106,0) 75%),
  radial-gradient(70% 70% at 50% 100%, rgba(127,217,154,.38) 0%, rgba(127,217,154,.10) 45%, rgba(127,217,154,0) 75%),
  radial-gradient(110% 80% at 50% 95%, rgba(38,92,66,.85) 0%, rgba(38,92,66,0) 70%),
  linear-gradient(180deg,#0c0c0d 0%,#0c0f0e 30%,#0f1d17 60%,#17402f 85%,#1d4a35 100%)}
.shot{position:absolute;left:-60px;top:40px;width:1400px;opacity:.22;filter:blur(9px) saturate(1.2);transform:rotate(-6deg) scale(1.1);mix-blend-mode:screen}
.grain{position:absolute;inset:0;opacity:.18;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.vign{position:absolute;inset:0;background:radial-gradient(75% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)}
svg.rib{position:absolute;inset:0}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center}
.logo{margin-top:64px;height:40px}
h1{margin-top:54px;font-family:YS;font-weight:400;font-size:74px;line-height:1.04;letter-spacing:-.02em;color:#F5F0E6;text-align:center;text-shadow:0 4px 40px rgba(0,0,0,.5)}
h1 span{display:block;color:#7FD99A}
.pill{margin-top:42px;display:flex;align-items:center;height:66px;padding:0 26px;border-radius:999px;background:#F5F0E6;box-shadow:0 0 0 5px rgba(12,12,13,.85),0 0 0 6px rgba(245,240,230,.35),0 20px 50px rgba(0,0,0,.55)}
.who{display:flex}
.who i{display:flex;align-items:center;justify-content:center;width:34px;height:34px;margin-left:-8px;border-radius:50%;border:2px solid #F5F0E6;font:normal 12px SM;color:#F5F0E6}
.who i:first-child{margin-left:0}
.label{font-family:SM;font-size:15px;letter-spacing:.12em;color:#0D120E;margin-left:18px}
</style></head><body><div class="card">
<img class="shot" src="${url(join(HOMEPAGE, 'public', 'images', 'product', 'timeline-dark.png'))}">
<svg class="rib" viewBox="0 0 1200 630">
  <defs>
    <path id="r1" d="M -40 230 Q 600 549 1240 300"/>
    <path id="r2" d="M -40 560 Q 600 429 1240 210"/>
  </defs>
  <use href="#r1" stroke="#0d120e" stroke-width="40" fill="none" opacity=".92"/>
  <use href="#r2" stroke="#0d120e" stroke-width="40" fill="none" opacity=".92"/>
  <text font-family="SM" font-size="15" fill="#F5F0E6" opacity=".85" dy="5" letter-spacing="1"><textPath href="#r1" startOffset="10">${RIBBON_ONE}</textPath></text>
  <text font-family="SM" font-size="15" fill="#F5F0E6" opacity=".85" dy="5" letter-spacing="1"><textPath href="#r2">${RIBBON_TWO}</textPath></text>
</svg>
<div class="vign"></div><div class="grain"></div>
<div class="center">
  <img class="logo" src="${url(join(HOMEPAGE, 'public', 'images', 'urganize-logo.png'))}">
  <h1>${LINE_ONE}<span>${LINE_TWO}</span></h1>
  <div class="pill"><div class="who"><i style="background:#14643a">DO</i><i style="background:#7a1f3a">ZB</i><i style="background:#1f3a7a">TA</i></div><span class="label">THE OPERATING SYSTEM FOR YOUR MUSIC CAREER</span></div>
</div>
</div></body></html>`;

// A page set from a string runs on about:blank, which may not load file://
// fonts and images, so the HTML is written to a temp file and opened from there.
const dir = mkdtempSync(join(tmpdir(), 'urganize-og-'));
const htmlPath = join(dir, 'card.html');
writeFileSync(htmlPath, html);

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(url(htmlPath), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 86 });
  // The old address, opengraph-image.png, stays alive with the new card on it:
  // links already shared, the brand page's old downloads and anyone hotlinking
  // it show the new card instead of a broken image. Tags point at the JPEG.
  const png = await page.screenshot({ type: 'png' });

  for (const target of [
    join(HOMEPAGE, 'public', 'opengraph-image.jpg'),
    join(WEB, 'public', 'opengraph-image.jpg'),
  ]) {
    writeFileSync(target, jpg);
    writeFileSync(target.replace(/\.jpg$/, '.png'), png);
    console.log(`[og] wrote ${jpg.length} bytes to ${target} (and the .png)`);
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log('[og] now bump SHARE_IMAGE_VERSION in apps/homepage/lib/seo.ts and apps/web/app/layout.tsx');
