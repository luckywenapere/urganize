// Builds docs/mocks/first-rollout-1412/mock.html (issue #1412), round 2.
//
// Round 2 rule (Oyin, 27 Nov): keep the look the app already has, and add only
// what has an impact. So the phone screens here are the REAL app, captured in
// the light theme from the local test app (screens-light/). The two "after"
// screens that differ from today were made by editing the live page: one
// heading and one line of text on the project screen, and a real date typed
// into the real date box. Nothing on them is drawn by hand.
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
const WORK = path.join(TOOLS, '.build-first-rollout');
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
const Num = (n, tone = 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900') =>
  `<span class="mr-1.5 inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${tone}">${n}</span>`;

// A real screen in a plain frame. `crop` shows a 504x748 window of a taller
// capture, starting `crop` pixels down (the capture is 504 wide).
const Shot = (file, alt, crop = 0) =>
  `<div class="overflow-hidden rounded-[26px] border-[6px] border-zinc-900 bg-[#f5f0e6] shadow-xl"><div class="relative w-full overflow-hidden" style="aspect-ratio:504/748"><img src="screens-light/${file}" alt="${alt}" class="absolute left-0 w-full max-w-none" style="top:-${(crop / 748 * 100).toFixed(2)}%"></div></div>`;

const Step = (n, title, note, shot, { flag = '', tone } = {}) =>
  `<figure class="flex flex-col gap-2.5">${shot}<figcaption><div class="flex items-start text-[13px] font-semibold leading-snug ${T1}">${Num(n, tone)}<span>${title}</span></div><div class="mt-1 text-[13px] leading-relaxed ${T2}">${note}</div>${flag ? `<div class="mt-1.5 text-[12.5px] font-semibold text-red-700 dark:text-red-400">${flag}</div>` : ''}</figcaption></figure>`;

const Arrow = `<div class="hidden items-center justify-center self-start pt-[135px] text-zinc-400 lg:flex">${ic('arrow-right', 'size-5')}</div>`;
const Row = (steps) => `<div class="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:flex lg:items-start lg:gap-3">${steps.map((s) => `<div class="lg:w-[196px] lg:shrink-0">${s}</div>`).join(Arrow)}</div>`;

const green = 'bg-emerald-700 text-white';

// ================= Today =================
const today = [
  Step(1, 'Create your account', 'Google works.', Shot('today-1-create-account.png', 'Create your account'), { flag: 'Email and password is turned away by a bug.' }),
  Step(2, 'Set up your team', 'A photo, a team name, who the team is for.', Shot('today-2-set-up-your-team.png', 'Set up your team'), { flag: '3 of 16 stopped here.' }),
  Step(3, '"Nothing here yet."', 'The first screen where music can be added.', Shot('today-3-nothing-here-yet.png', 'Nothing here yet'), { flag: '5 of 16 stopped here or at the plan wall.' }),
  Step(4, 'The form, on a phone', '"Add it" is pinned to the bottom. The release day question is under it, with "No date yet" picked.', Shot('today-4-form-on-a-phone.png', 'The project form on a phone'), { flag: '0 of 16 picked a day.' }),
  Step(5, 'What they land on', 'A page that asks for "the idea". No plan until they type one.', Shot('today-5-empty-page.png', 'An empty rollout'), { flag: 'Only 2 of 16 have a plan.' }),
];

// ================= After =================
const after = [
  Step(1, 'Create your account', 'The screen does not change. Email and password works.', Shot('today-1-create-account.png', 'Create your account'), { tone: green }),
  Step(2, 'The project screen comes next', 'No team screen. The team is made as "Tunde\'s Team". Only the heading and one line change.', Shot('after-2-project-screen.png', 'What are you working on'), { tone: green }),
  Step(3, 'The same form', 'A release day is already picked, 8 weeks from today. Same chips, same date box.', Shot('after-3-form-full-page.png', 'The form with a day picked', 396), { tone: green }),
  Step(4, 'What they land on', 'The plan the app already builds. Nothing on this screen is new.', Shot('after-4-the-plan.png', 'The plan'), { tone: green }),
];

// ================= The changes =================
const changes = [
  ['Email sign-up works', 'Since sign-up opened on 8 Nov, nobody without an invite has got in with an email and a password. Bug, live now (#1415).', 'Nothing.'],
  ['The team screen leaves sign-up', '3 of 16 stopped on it.', 'Nothing. The team is made as "Tunde\'s Team" and can be renamed in Team, as today. Home already has the card that asks "Who are you?" when we do not know.'],
  ['A release day is already picked', '0 of 16 picked a day, so nobody got a plan straight away. Only 2 of 16 have a plan at all (15 and 24 tasks, no date). On a phone the question sits under the pinned "Add it" button.', 'Nothing. The same chips and date box, with "Pick a day" on and the day filled in: 8 weeks from today, because the single plan starts 8 weeks before release day.'],
  ['The heading asks a question', 'This becomes the first screen after the account, and today it opens with "Nothing here yet."', 'Five words: "What are you working on?" The line under it becomes "Add it to Tunde\'s Team, or ask someone to invite you." Your call on the words.'],
];
const cut = [
  ['The example plan (option B)', 'A new kind of rollout to build and to keep out of our numbers.'],
  ['Three stages in place of five', 'Nobody was measured stopping on the stages.'],
  ['The "It\'s me" button', 'Home already asks "Who are you?".'],
  ['The "You get 16 steps" line', 'The button already says what it does.'],
  ['"Not sure" and the "Date not confirmed" badge', 'The first step of every plan is already "Confirm release date and lock it".'],
  ['Moving the price sheet', 'It did not open in today\'s two walks, so I cannot say when it shows. Not touched.'],
  ['The "Profile setup required" stop', 'No number behind it yet.'],
  ['New buttons, cards or colours', 'None. Every screen is the app as it is.'],
];

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>First plan mocks (#1412)</title>
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
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mocks, round 2 · 27 Nov 2026 · issue #1412</div>
      <div class="inline-flex h-9 items-center rounded-lg bg-zinc-300/70 p-1 text-sm dark:bg-zinc-800">
        <button data-set="light" class="theme-btn rounded-md px-3 py-1 font-medium">Light</button>
        <button data-set="dark" class="theme-btn rounded-md px-3 py-1 font-medium">Dark</button>
      </div>
    </div>
    <h1 class="mt-4 text-[36px] font-semibold leading-tight tracking-tight ${T1}">Same screens. Four changes.</h1>
    <p class="mt-3 max-w-[70ch] text-[16px] leading-relaxed ${T2}">Round 2, after your note: keep the look the app already has, and add only what has an impact. Every screen below is the real app in the light theme. Nothing is redrawn. Each change has the number behind it, and everything else from round 1 is cut.</p>
  </header>

  <section id="today" class="mx-auto mt-10 max-w-[1180px] py-4">
    <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Today</div>
    <h2 class="mt-1 text-[26px] font-semibold tracking-tight ${T1}">Three screens, then a page with no plan</h2>
    <p class="mt-1.5 max-w-[70ch] text-[15px] ${T2}">16 real accounts since 3 Nov. 13 of them on a phone. 15 opened the app on one day only.</p>
    ${Row(today)}
  </section>

  <section id="after" class="mx-auto mt-12 max-w-[1180px] py-4">
    <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">After<span class="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] tracking-wide text-white">Option A, recommended</span></div>
    <h2 class="mt-1 text-[26px] font-semibold tracking-tight ${T1}">One screen, then the plan</h2>
    <p class="mt-1.5 max-w-[70ch] text-[15px] ${T2}">The same screens the app has now, one fewer, with a release day already picked.</p>
    ${Row(after)}
  </section>

  <section id="changes" class="mx-auto mt-12 max-w-[1180px] py-4">
    <h2 class="text-[26px] font-semibold tracking-tight ${T1}">The four changes, and the number behind each</h2>
    <div class="mt-4 overflow-hidden ${B}">
      <div class="hidden grid-cols-[1fr_1.25fr_1.5fr] gap-5 border-b border-zinc-200 px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 md:grid"><div>Change</div><div>The number behind it</div><div>New on screen</div></div>
      ${changes.map(([t, n, ui], i) => `<div class="grid gap-x-5 gap-y-1.5 px-5 py-4 md:grid-cols-[1fr_1.25fr_1.5fr] ${i ? 'border-t border-zinc-200 dark:border-zinc-800' : ''}"><div class="flex items-start text-[15px] font-semibold leading-snug ${T1}">${Num(i + 1, green)}<span>${t}</span></div><div class="text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">${n}</div><div class="text-[14px] leading-relaxed ${T2}">${ui}</div></div>`).join('')}
    </div>

    <div class="mt-3 grid gap-3 md:grid-cols-[1.25fr_1fr]">
      <div class="${B} p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Cut from round 1</div>
        <div class="mt-1 text-[17px] font-semibold ${T1}">Left out, because no number asks for it</div>
        <ul class="mt-3 flex flex-col gap-2">
          ${cut.map(([t, why]) => `<li class="flex gap-2.5 text-[13.5px] leading-relaxed ${T2}"><span class="mt-[3px] text-zinc-400">${ic('x', 'size-4')}</span><span><b class="font-semibold ${T1}">${t}.</b> ${why}</span></li>`).join('')}
        </ul>
      </div>
      <div class="${B} p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Add-on, your call</div>
        <div class="mt-1 text-[17px] font-semibold ${T1}">One email the next morning</div>
        <p class="mt-1.5 text-[13.5px] leading-relaxed ${T2}">15 of 16 never came back, and the 8 who stopped halfway got no email asking them to finish. This goes to anyone who made an account and added no music, in the email template we already use.</p>
        <div class="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-[13.5px] leading-relaxed dark:border-zinc-800 dark:bg-zinc-950 ${T2}">
          <div class="text-[12px] text-zinc-500">Subject</div>
          <div class="font-semibold ${T1}">You stopped before adding your song</div>
          <div class="mt-2.5">Hi Tunde,</div>
          <div class="mt-1.5">You made your Urganize account yesterday and stopped before adding your music.</div>
          <div class="mt-1.5">Give it a song name and a release day. The plan is made as soon as you do.</div>
          <div class="mt-1.5 font-semibold text-emerald-800 underline underline-offset-4 dark:text-emerald-400">Add my song</div>
          <div class="mt-1.5">Oyin</div>
        </div>
        <p class="mt-2.5 text-[12.5px] leading-relaxed ${T2}">The words are a first guess. Nothing is sent until you approve them.</p>
      </div>
    </div>

    <h2 class="mt-10 text-[22px] font-semibold tracking-tight ${T1}">The one choice</h2>
    <div class="mt-3 grid gap-3 md:grid-cols-2">
      <div class="rounded-xl border-2 border-emerald-700 bg-white p-5 dark:bg-zinc-900"><div class="flex items-center gap-2 text-[16px] font-semibold ${T1}">A. The team screen leaves sign-up<span class="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">My pick</span></div><div class="mt-1.5 text-[14px] leading-relaxed ${T2}">All four changes, as drawn above. One screen between the account and the plan.</div></div>
      <div class="${B} p-5"><div class="text-[16px] font-semibold ${T1}">C. The team screen stays</div><div class="mt-1.5 text-[14px] leading-relaxed ${T2}">Changes 1 and 3 only. Two screens between the account and the plan, and the 3 of 16 who stopped at the team screen still meet it.</div></div>
    </div>

    <h2 class="mt-10 text-[22px] font-semibold tracking-tight ${T1}">Measured vs assumed</h2>
    <ul class="mt-3 flex flex-col gap-2 text-[14.5px] leading-relaxed ${T2}">
      <li><b class="${T1}">Measured:</b> the account numbers (production, read-only, 26 and 27 Nov), the email sign-up block (production, 27 Nov), and every screen here (local test app, 27 Nov).</li>
      <li><b class="${T1}">Assumed:</b> that people leave because of these screens and not for a reason we cannot see. There is no click data for sign-up.</li>
    </ul>
  </section>

<script>
(function(){
  var root=document.documentElement;
  function set(t){root.setAttribute('data-theme',t);document.querySelectorAll('.theme-btn').forEach(function(b){var on=b.getAttribute('data-set')===t;b.style.background=on?(t==='dark'?'#27272a':'#fff'):'transparent';b.style.color=on?(t==='dark'?'#fafafa':'#18181b'):'#71717a';});try{localStorage.setItem('mock-theme-1412',t)}catch(e){}}
  var saved=null;try{saved=localStorage.getItem('mock-theme-1412')}catch(e){}
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
