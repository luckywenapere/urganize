// Builds docs/mocks/trial-sheet-who-for-1424/mock.html (issue #1424).
//
// Rule (Oyin, 27 Nov): keep the look the app already has, and add only what
// has an impact. So every phone screen here is the REAL trial sheet, captured
// in the light theme from the local test app. The options were made by adding
// the question to the live page with the app's own class strings: the chips
// from the project form (chipClass in OnboardingFrame.tsx) and the three rows
// from the old team screen (OnboardingTeamScreens.tsx). Nothing is drawn by hand.
//
// Setup once, in an empty folder OUTSIDE this repo (npm inside a pnpm workspace
// installs into the workspace root):
//   npm i tailwindcss@3.4.17 lucide-static@0.460.0
// then, from this folder:
//   MOCK_TOOLS=<that folder> node build.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TOOLS = process.env.MOCK_TOOLS || __dirname;
const WORK = path.join(TOOLS, '.build-trial-sheet-who-for');
const OUT = path.join(__dirname, 'mock.html');
const fwd = (p) => p.replace(/\\/g, '/');
const missing = new Set();
function ic(name, cls = 'size-4') {
  const p = path.join(TOOLS, 'node_modules/lucide-static/icons', name + '.svg');
  if (!fs.existsSync(p)) { missing.add(name); return ''; }
  return fs.readFileSync(p, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(width|height)="24"/g, '')
    .replace('class="lucide', `aria-hidden="true" class="shrink-0 ${cls} lucide`)
    .replace(/\r?\n\s*/g, ' ').trim();
}

// ---------- board pieces ----------
const B = 'rounded-xl border border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-900';
const T1 = 'text-zinc-900 dark:text-zinc-50';
const T2 = 'text-zinc-600 dark:text-zinc-400';
const green = 'bg-emerald-700 text-white';
const Num = (n, tone = 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900') =>
  `<span class="mr-1.5 inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${tone}">${n}</span>`;

// A real screen (390 x 780) in a plain frame.
const Shot = (file, alt) =>
  `<div class="overflow-hidden rounded-[26px] border-[6px] border-zinc-900 bg-[#f5f0e6] shadow-xl"><img src="screens/${file}" alt="${alt}" class="block w-full" style="aspect-ratio:390/780"></div>`;

const Step = (n, title, note, shot, { flag = '', tone } = {}) =>
  `<figure class="flex flex-col gap-2.5">${shot}<figcaption><div class="flex items-start text-[13px] font-semibold leading-snug ${T1}">${Num(n, tone)}<span>${title}</span></div><div class="mt-1 text-[13px] leading-relaxed ${T2}">${note}</div>${flag ? `<div class="mt-1.5 text-[12.5px] font-semibold text-red-700 dark:text-red-400">${flag}</div>` : ''}</figcaption></figure>`;

const Arrow = `<div class="hidden items-center justify-center self-start pt-[210px] text-zinc-400 lg:flex">${ic('arrow-right', 'size-5')}</div>`;
const Row = (steps) => `<div class="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:flex lg:items-start lg:gap-3">${steps.map((s) => `<div class="lg:w-[236px] lg:shrink-0">${s}</div>`).join(Arrow)}</div>`;

// ================= Today =================
const today = [
  Step(1, 'The trial sheet today', 'It opens once, about 45 seconds after the first plan lands. Nobody was asked who the team is for, so it shows Solo.', Shot('0-today-solo.png', 'The trial sheet today'), {
    flag: '8 of 16 are managers or labels. They see a plan for one artist.',
  }),
];

// ================= Option 1 =================
const chips = [
  Step(1, 'The same sheet, one question', 'One line and three chips. Solo shows until they tap. "Keep going" works with or without an answer.', Shot('1a-chips-before.png', 'Chips, before a tap'), { tone: green }),
  Step(2, 'They tap "Just me, I\'m the artist"', 'The plan stays Solo. The answer is saved.', Shot('1b-chips-artist.png', 'Chips, the artist'), { tone: green }),
  Step(3, 'They tap "Artists I manage"', 'The plan changes to Pro at once. "A label" does the same.', Shot('1c-chips-manager.png', 'Chips, a manager'), { tone: green }),
];

// ================= Option 2 =================
const rows = [
  Step(1, 'The three rows from the old team screen', 'The same question, as the rows sign-up used to show.', Shot('2a-rows-before.png', 'Rows, before a tap')),
  Step(2, 'They tap "Artists I manage"', 'The plan changes to Pro at once.', Shot('2b-rows-manager.png', 'Rows, a manager')),
];

const facts = [
  ['New on screen', 'One line and three chips. They are the chips the project form already uses for Single, EP and Album.', 'One line and three rows. They are the rows the old team screen used.'],
  ['Words', 'None new. "Who is this team for?", "Just me, I\'m the artist", "Artists I manage" and "A label" are the old team screen\'s words.', 'The same.'],
  ['Sheet height on a 390 by 780 phone', '520 px. It is 381 px today. The chips take two rows, and "A label" sits alone on the second.', '596 px, three quarters of the screen. Four boxes in a column, and two of them outlined in green (the row picked and the plan).'],
  ['When they tap', 'The plan on the sheet changes at once. The answer is saved the way the old team screen saved it, so the plan wall shows the same plan later and the admin split has its answer.', 'The same.'],
  ['When they do not tap', 'Solo, as today. Nothing blocks "Keep going".', 'The same.'],
];

const cut = [
  ['A second screen for the question', 'One tap on a sheet that already opens is enough.'],
  ['New words', 'The old team screen\'s words are reused.'],
  ['Changing the plan card', 'Same card, same badge, same "See all plans".'],
  ['The iPhone app', 'The sheet shows no plan there (the existing rule), so the question is not shown there either.'],
  ['Asking again on Home', 'Someone who answers here is not asked by the "Who are you?" card.'],
];

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trial sheet question (#1424)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
@tailwind base; @tailwind components; @tailwind utilities;
body { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
</style>
</head>
<body class="min-h-screen bg-zinc-200 px-4 pb-24 pt-10 dark:bg-zinc-950">
  <header id="top" class="mx-auto max-w-[1180px] py-2">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mock · 27 Nov 2026 · issue #1424</div>
      <div class="inline-flex h-9 items-center rounded-lg bg-zinc-300/70 p-1 text-sm dark:bg-zinc-800">
        <button data-set="light" class="theme-btn rounded-md px-3 py-1 font-medium">Light</button>
        <button data-set="dark" class="theme-btn rounded-md px-3 py-1 font-medium">Dark</button>
      </div>
    </div>
    <h1 class="mt-4 text-[36px] font-semibold leading-tight tracking-tight ${T1}">One tap on the trial sheet</h1>
    <p class="mt-3 max-w-[72ch] text-[16px] leading-relaxed ${T2}">Sign-up no longer asks who the team is for, so the plan shown first is Solo. That is right for the artists and too small for the managers and labels. One tap on the sheet that already opens fixes it for both. Every screen below is the real app in the light theme. Only the question is added.</p>
  </header>

  <section id="today" class="mx-auto mt-10 max-w-[1180px] py-4">
    <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Today</div>
    <h2 class="mt-1 text-[26px] font-semibold tracking-tight ${T1}">Everyone with no answer sees Solo</h2>
    <p class="mt-1.5 max-w-[72ch] text-[15px] ${T2}">Of the 16 new accounts that said who they are since 29 Oct: 8 artists, 5 labels, 3 managers. Team size cannot tell them apart in the first days: 14 of the 15 manager or label teams have one artist or none.</p>
    <div class="mt-6 grid gap-6 md:grid-cols-[236px_1fr] md:items-start">
      ${today[0]}
      <div class="${B} p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">What each option changes</div>
        <div class="mt-3 hidden grid-cols-[0.8fr_1.3fr_1.1fr] gap-5 border-b border-zinc-200 pb-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 md:grid"><div></div><div>Option 1, chips</div><div>Option 2, rows</div></div>
        ${facts.map(([k, a, b], i) => `<div class="grid gap-x-5 gap-y-1 py-3 md:grid-cols-[0.8fr_1.3fr_1.1fr] ${i ? 'border-t border-zinc-200 dark:border-zinc-800' : ''}"><div class="text-[14px] font-semibold ${T1}">${k}</div><div class="text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">${a}</div><div class="text-[14px] leading-relaxed ${T2}">${b}</div></div>`).join('')}
      </div>
    </div>
  </section>

  <section id="chips" class="mx-auto mt-12 max-w-[1180px] py-4">
    <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Option 1<span class="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] tracking-wide text-white">Recommended</span></div>
    <h2 class="mt-1 text-[26px] font-semibold tracking-tight ${T1}">Three chips above the plan</h2>
    <p class="mt-1.5 max-w-[72ch] text-[15px] ${T2}">The lighter of the two. The sheet grows by two rows of chips, and the picked chip does not fight the plan card for attention.</p>
    ${Row(chips)}
  </section>

  <section id="rows" class="mx-auto mt-12 max-w-[1180px] py-4">
    <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Option 2</div>
    <h2 class="mt-1 text-[26px] font-semibold tracking-tight ${T1}">The three rows from the old team screen</h2>
    <p class="mt-1.5 max-w-[72ch] text-[15px] ${T2}">Bigger targets and a tidy column, but a taller sheet with two green outlines on it.</p>
    ${Row(rows)}
  </section>

  <section id="notes" class="mx-auto mt-12 max-w-[1180px] py-4">
    <div class="grid gap-3 md:grid-cols-2">
      <div class="${B} p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Left out</div>
        <ul class="mt-3 flex flex-col gap-2">
          ${cut.map(([t, why]) => `<li class="flex gap-2.5 text-[13.5px] leading-relaxed ${T2}"><span class="mt-[3px] text-zinc-400">${ic('x', 'size-4')}</span><span><b class="font-semibold ${T1}">${t}.</b> ${why}</span></li>`).join('')}
        </ul>
      </div>
      <div class="${B} p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Measured vs assumed</div>
        <ul class="mt-3 flex flex-col gap-2 text-[14px] leading-relaxed ${T2}">
          <li><b class="${T1}">Measured:</b> who said what and team sizes (production, read-only, 27 Nov), the sheet heights and every screen here (local test app, 27 Nov).</li>
          <li><b class="${T1}">Assumed:</b> that people will tap. There is no click data for this sheet. If few tap, nothing is lost: they see Solo, as today.</li>
          <li><b class="${T1}">Not in this mock:</b> a loading state. The sheet opens already drawn, so there is no skeleton to change.</li>
        </ul>
      </div>
    </div>
  </section>

<script>
(function(){
  var root=document.documentElement;
  function set(t){root.setAttribute('data-theme',t);document.querySelectorAll('.theme-btn').forEach(function(b){var on=b.getAttribute('data-set')===t;b.style.background=on?(t==='dark'?'#27272a':'#fff'):'transparent';b.style.color=on?(t==='dark'?'#fafafa':'#18181b'):'#71717a';});try{localStorage.setItem('mock-theme-1424',t)}catch(e){}}
  var saved=null;try{saved=localStorage.getItem('mock-theme-1424')}catch(e){}
  set(saved||'light');
  document.querySelectorAll('.theme-btn').forEach(function(b){b.addEventListener('click',function(){set(b.getAttribute('data-set'))})});
})();
</script>
</body>
</html>`;

fs.mkdirSync(WORK, { recursive: true });
const src = path.join(WORK, 'src.html');
fs.writeFileSync(src, html);
const cfg = `module.exports = {
  content: ['${fwd(src)}'],
  darkMode: ['variant', '&:is([data-theme="dark"] *)'],
  theme: { extend: { fontFamily: { mono: ['"DM Mono"', 'ui-monospace', 'monospace'] } } },
};`;
fs.writeFileSync(path.join(WORK, 'tailwind.config.js'), cfg);
fs.writeFileSync(path.join(WORK, 'in.css'), html.match(/<style>([\s\S]*?)<\/style>/)[1]);
execFileSync(process.execPath, [path.join(TOOLS, 'node_modules/tailwindcss/lib/cli.js'), '-c', 'tailwind.config.js', '-i', 'in.css', '-o', 'out.css', '--minify'], { cwd: WORK, stdio: 'pipe' });
const css = fs.readFileSync(path.join(WORK, 'out.css'), 'utf8');
fs.writeFileSync(OUT, html.replace(/<style>[\s\S]*?<\/style>/, () => `<style>${css}</style>`));
if (missing.size) console.log('MISSING ICONS:', [...missing].join(', '));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
