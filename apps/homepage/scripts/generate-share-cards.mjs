// Redraw the per-page share cards in public/share/.
//
//   node apps/homepage/scripts/generate-share-cards.mjs            every card below
//   node apps/homepage/scripts/generate-share-cards.mjs features   one card
//
// WHY THIS SCRIPT EXISTS. Each main page has its own share card: the page's
// real H1 over a small slice of the product, in the app's light theme, with
// the made-up Northline Music demo team (#964). The first set was drawn from a
// mock outside the repo, so when three H1s changed on 2026-11-15 (#1299) there
// was nothing to re-run. This is the source for the cards whose words have
// changed since; a card not listed in CARDS keeps the file it has.
//
// Same tools as generate-og-image.mjs: real HTML, screenshotted by Chromium
// through Playwright, which is not a repo dependency. Make
// `require('playwright')` resolve (NODE_PATH or a global install) and set
// CHROME_PATH to a Chrome binary when Playwright's own download is missing.
//
// AFTER RUNNING IT: bump SHARE_CARDS_VERSION in lib/seo.ts and keep each
// card's alt there in step with its words, or WhatsApp and X keep the old
// picture. The headline here is typed by hand to match the page's H1.

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
  console.error('[share] playwright is not installed; see the note at the top of this file.');
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const HOMEPAGE = join(HERE, '..');
const FONTS = join(HOMEPAGE, '..', 'web', 'assets', 'fonts');
const url = (path) => pathToFileURL(path).href;

const avatar = (initials, color) => `<i class="av" style="background:${color}">${initials}</i>`;
const cover = (color) => `<i class="cover" style="background:${color}"></i>`;
const bar = (done, total) =>
  `<span class="bar"><b style="width:${Math.round((done / total) * 100)}%"></b></span><span class="mono">${done}/${total}</span>`;

const CARDS = {
  features: {
    path: 'urganize.app/features',
    lead: 'One plan.',
    accent: 'Every task has an owner.',
    body: `
      <div class="crumb">Rollouts <span>›</span> <strong>Iyawo Mi</strong> <em>Hadiza Moon</em></div>
      <div class="row head" style="grid-template-columns:1fr 190px 170px"><span>Activity</span><span>Owner</span><span>Due</span></div>
      ${[
        ['Lock the master file', 'DO', '#14643a', 'Dami', 'Done', true],
        ['Brief designer on cover art', 'ZB', '#7a1f3a', 'Zainab', 'Fri 20 Nov'],
        ['Book the venue for the launch show', 'TA', '#1f3a7a', 'Tobi', 'Mon 23 Nov'],
        ['Pitch to playlist curators', 'DO', '#14643a', 'Dami', 'Wed 25 Nov'],
      ]
        .map(
          ([task, initials, color, name, due, done]) =>
            `<div class="row" style="grid-template-columns:1fr 190px 170px"><span class="task ${done ? 'done' : ''}"><i class="check"></i>${task}</span><span class="who">${avatar(initials, color)}${name}</span><span class="muted">${due}</span></div>`,
        )
        .join('')}`,
  },
  'for-managers': {
    path: 'urganize.app/for-managers',
    lead: 'Every artist’s plan.',
    accent: 'One screen, not five chats.',
    body: `
      <div class="row head" style="grid-template-columns:1fr 200px 250px"><span>Rollout</span><span>Release date</span><span>Progress</span></div>
      ${[
        ['Love Letters from Yaba', 'Yaba Kid', '#2a2a78', 'Dec 12, 2026', 14, 17],
        ['Iyawo Mi', 'Hadiza Moon', '#7a1f3a', 'Dec 11, 2026', 13, 17],
        ['Ife Mi', 'Temi Ivory', '#1f5a6e', 'Jan 9, 2027', 4, 13],
        ['Owambe Weather', 'Lagoon Theory', '#3a5a1c', 'Nov 27, 2026', 17, 19],
      ]
        .map(
          ([title, artist, color, date, done, total]) =>
            `<div class="row tall" style="grid-template-columns:1fr 200px 250px"><span class="rollout">${cover(color)}<span><strong>${title}</strong><em>${artist}</em></span></span><span>${date}</span><span class="progress">${bar(done, total)}</span></div>`,
        )
        .join('')}`,
  },
  'for-executives': {
    path: 'urganize.app/for-executives',
    lead: 'Your whole roster.',
    accent: 'Every task tracked.',
    body: `
      <div class="crumb"><strong>Artists</strong> <em>7 artists · 10 rollouts</em></div>
      <div class="row head" style="grid-template-columns:1fr 230px 120px 120px"><span>Artist</span><span>Next up</span><span>Date</span><span>Status</span></div>
      ${[
        ['KG', '#14643a', 'Kanmi Gold', 'Harmattan Gold', '18 Dec', 'On plan'],
        ['HM', '#7a1f3a', 'Hadiza Moon', 'Iyawo Mi', '11 Dec', 'On plan'],
        ['LT', '#3a5a1c', 'Lagoon Theory', 'Launch show, Lagos', '27 Nov', '2 late'],
        ['TI', '#1f5a6e', 'Temi Ivory', 'Ife Mi', '9 Jan', 'On plan'],
      ]
        .map(
          ([initials, color, name, next, date, status]) =>
            `<div class="row" style="grid-template-columns:1fr 230px 120px 120px"><span class="who"><span>${avatar(initials, color)}</span><strong>${name}</strong></span><span>${next}</span><span class="muted">${date}</span><span><b class="pill ${status === 'On plan' ? '' : 'late'}">${status}</b></span></div>`,
        )
        .join('')}`,
  },
};

const page = ({ path, lead, accent, body }) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:YS;src:url(${url(join(FONTS, 'DMSans-Bold.ttf'))})}
@font-face{font-family:SM;src:url(${url(join(FONTS, 'DMMono-Regular.ttf'))})}
@font-face{font-family:SG;font-weight:400;src:url(${url(join(FONTS, 'DMSans-Regular.ttf'))})}
@font-face{font-family:SG;font-weight:500;src:url(${url(join(FONTS, 'DMSans-Medium.ttf'))})}
*{margin:0;box-sizing:border-box;font-style:normal}
body{width:1200px;height:630px;overflow:hidden;background:#f5f0e6;color:#1a1611;font-family:SG;font-size:17px}
.top{display:flex;justify-content:space-between;align-items:center;padding:38px 64px 0}
.top img{height:30px;filter:brightness(0)}
.top span{font-family:SM;font-size:15px;color:#6a665f}
h1{margin-top:30px;text-align:center;font-family:YS;font-weight:400;font-size:62px;line-height:1.02;letter-spacing:-.01em}
h1 span{display:block;color:#14643a}
.card{position:absolute;left:120px;right:120px;top:262px;height:460px;padding:24px 28px;border-radius:22px;background:#faf5ec;border:1px solid #e4dccb;box-shadow:0 20px 60px rgba(26,22,17,.08)}
.crumb{margin-bottom:14px;color:#4b4740}.crumb span{margin:0 8px;color:#6a665f}.crumb strong{font-weight:500;color:#1a1611;margin-right:8px}.crumb em{color:#6a665f}
.row{display:grid;align-items:center;height:52px;border-bottom:1px solid #e4dccb}
.row.tall{height:70px}
.row.head{height:36px;font-size:14px;color:#6a665f}
.row strong{font-weight:500}
.muted{color:#6a665f}.mono{font-family:SM;font-size:14px;color:#6a665f;margin-left:12px}
.task{display:flex;align-items:center;gap:14px;font-weight:500}
.task.done{font-weight:400;color:#4b4740}
.check{width:20px;height:20px;border-radius:50%;border:1.5px solid #b9b1a0}
.task.done .check{background:#14643a;border-color:#14643a}
.who{display:flex;align-items:center;gap:10px}
.av{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;color:#f5f0e6;font-size:11px;font-weight:500}
.rollout{display:flex;align-items:center;gap:12px}.rollout span{display:flex;flex-direction:column;line-height:1.3}.rollout em{color:#6a665f}
.cover{width:44px;height:44px;border-radius:6px}
.progress{display:flex;align-items:center}
.bar{display:block;width:150px;height:6px;border-radius:3px;background:#e4dccb}.bar b{display:block;height:6px;border-radius:3px;background:#14643a}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;background:#d9e8dc;color:#14643a;font-size:14px;font-weight:500}
.pill.late{background:#f3e2bd;color:#7a4a00}
</style></head><body>
<div class="top"><img src="${url(join(HOMEPAGE, 'public', 'images', 'urganize-logo.png'))}"><span>${path}</span></div>
<h1>${lead}<span>${accent}</span></h1>
<div class="card">${body}</div>
</body></html>`;

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(CARDS);
const dir = mkdtempSync(join(tmpdir(), 'urganize-share-'));
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
try {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const name of names) {
    if (!CARDS[name]) throw new Error(`[share] no card called ${name}`);
    const htmlPath = join(dir, `${name}.html`);
    writeFileSync(htmlPath, page(CARDS[name]));
    await tab.goto(url(htmlPath), { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    const target = join(HOMEPAGE, 'public', 'share', `${name}.jpg`);
    writeFileSync(target, await tab.screenshot({ type: 'jpeg', quality: 88 }));
    console.log(`[share] wrote ${target}`);
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log('[share] now bump SHARE_CARDS_VERSION in apps/homepage/lib/seo.ts and check each alt');
