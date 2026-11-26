// Builds docs/mocks/dayzero-activation/mock.html (issue #1393) from shadcn/ui (new-york)
// class strings, the app's tokens, lucide icons, and Tailwind compiled inline.
// Setup once: install tailwindcss@3.4.17 and lucide-static@0.460.0 into ./node_modules
// (outside the pnpm workspace, then symlink), then: node build.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUT = path.join(__dirname, 'mock.html');
const missing = new Set();
function ic(name, cls = 'size-4') {
  const p = path.join(__dirname, 'node_modules/lucide-static/icons', name + '.svg');
  if (!fs.existsSync(p)) { missing.add(name); return ''; }
  return fs.readFileSync(p, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(width|height)="24"/g, '')
    .replace('class="lucide', `aria-hidden="true" class="shrink-0 ${cls} lucide`)
    .replace(/\n\s*/g, ' ').trim();
}

// ---------- shadcn/ui (new-york) primitives ----------
const btnBase = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const btnV = {
  default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};
const Button = (label, { v = 'default', icon, iconRight, cls = '' } = {}) =>
  `<button class="${btnBase} ${btnV[v]} h-10 px-4 ${cls}">${icon ? ic(icon) : ''}${label}${iconRight ? ic(iconRight) : ''}</button>`;
const Badge = (label, icon) =>
  `<span class="inline-flex items-center gap-1 rounded-md border border-transparent bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">${icon ? ic(icon, 'size-3') : ''}${label}</span>`;
const Card = (inner, cls = '') => `<div class="rounded-xl border border-border bg-card text-card-foreground shadow ${cls}">${inner}</div>`;
const Separator = (cls = '') => `<div class="h-px w-full shrink-0 bg-border ${cls}"></div>`;

// ---------- app pieces ----------
// A browser window at team.urganize.app, page centred like /auth.
function Browser(url, content) {
  return `<div class="flex w-full flex-col overflow-hidden rounded-xl border border-zinc-300 bg-background text-foreground shadow-xl dark:border-zinc-800">
    <div class="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-muted/60 px-3">
      <span class="flex gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-zinc-400/60"></span><span class="h-2.5 w-2.5 rounded-full bg-zinc-400/60"></span><span class="h-2.5 w-2.5 rounded-full bg-zinc-400/60"></span></span>
      <span class="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md bg-background px-2.5 py-1 text-[12px] text-muted-foreground">${ic('lock', 'size-3')}${url}</span>
    </div>
    <div class="flex min-h-[520px] flex-col items-center px-4 pb-10 pt-8">
      <div class="mb-8 flex items-center gap-2 text-[15px] font-semibold"><span class="grid h-7 w-7 place-items-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">U</span>Urganize</div>
      <div class="w-full max-w-[420px]">${content}</div>
    </div>
  </div>`;
}

const Tile = (icon, tone = 'primary') => {
  const t = { primary: 'bg-primary/15 text-primary', warn: 'bg-warn/15 text-warn', muted: 'bg-muted text-muted-foreground' }[tone];
  return `<span class="grid h-12 w-12 place-items-center rounded-xl ${t}">${ic(icon, 'size-6')}</span>`;
};
const H = (t) => `<h1 class="mt-5 font-display text-[28px] leading-tight">${t}</h1>`;
const P = (t, cls = '') => `<p class="mt-2 text-[15px] leading-relaxed text-muted-foreground ${cls}">${t}</p>`;
const Note = (icon, t) => `<div class="mt-5 flex gap-2 text-[13px] leading-relaxed text-muted-foreground">${ic(icon, 'size-4 mt-0.5')}<span>${t}</span></div>`;
const Actions = (primary, secondary = '') => `<div class="mt-7 flex flex-col gap-2">${primary}${secondary}</div>`;

const Page = (inner) => Card(`<div class="p-7">${inner}</div>`);

const Screen = (n, title, when, url, body) =>
  `<figure class="flex w-full max-w-[560px] flex-col gap-3"><figcaption class="min-h-[64px]"><div class="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100"><span class="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">${n}</span>${title}</div><div class="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">${when}</div></figcaption>${Browser(url, body)}</figure>`;

const PRO = [
  ['mic', '3 artists'],
  ['users', '6 people on your team'],
  ['calendar-range', '3 rollouts at a time'],
  ['sparkles', '450 AI credits every month'],
];

const screens = [
  Screen(1, 'Opened without a code', 'Someone opens the link directly, or Day Zero checks that the page is up. Answers 200.', 'team.urganize.app/dayzero/callback',
    Page(`${Tile('key-round', 'muted')}
      ${H('Activate from your Day Zero account')}
      ${P('Open your Day Zero account, find Urganize and click Activate. You come back here and Pro is added to your account.')}
      ${Actions(Button('Open Day Zero', { iconRight: 'arrow-up-right' }), Button('I already activated, open Urganize', { v: 'ghost', cls: 'text-muted-foreground' }))}`)),

  Screen(2, 'Signed out, license is good', 'The license checked out as active. It waits in a cookie on this device for 1 hour while they make an account or sign in.', 'team.urganize.app/dayzero/callback?code=…',
    Page(`<div class="flex items-center justify-between">${Tile('badge-check')}${Badge('Pro for life', 'infinity')}</div>
      ${H('Your Day Zero license is ready')}
      ${P('Create your Urganize account, or sign in to the one you have. Pro goes on it straight away.')}
      ${Actions(Button('Create your account'), Button('I already have an account', { v: 'outline' }))}
      ${Note('clock', 'This device holds your license for 1 hour. After that, click Activate in Day Zero again.')}`)),

  Screen(3, 'License added', 'Shown once, after the license is attached (signed in already, or right after sign-in or the new account).', 'team.urganize.app/dayzero/callback',
    Page(`${Tile('party-popper')}
      ${H('Pro is yours, for life')}
      ${P('No card and no renewals. Here is what your team gets:')}
      <ul class="mt-5 flex flex-col gap-3">${PRO.map(([i, t]) => `<li class="flex items-center gap-3 text-[15px]"><span class="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">${ic(i)}</span>${t}</li>`).join('')}</ul>
      ${Separator('mt-6')}
      ${Actions(Button('Open your dashboard', { iconRight: 'arrow-right' }))}`)),

  Screen(4, 'License is on another account', 'One license fits one account. The other account is never named, for privacy.', 'team.urganize.app/dayzero/callback?code=…',
    Page(`${Tile('user-x', 'warn')}
      ${H('This license is on another account')}
      ${P('Each Day Zero license works on one Urganize account. Sign in with the account you used the first time.')}
      ${Actions(Button('Switch account'), Button('Email us', { v: 'outline', icon: 'mail' }))}
      ${Note('info', 'Bought a second license? Activate it from Day Zero while signed in to the other account.')}`)),

  Screen(5, 'Link expired or license not active', 'The code was used already, is older than 10 minutes, or Day Zero says the license is not active (refunded).', 'team.urganize.app/dayzero/callback?code=…',
    Page(`${Tile('link-2-off', 'warn')}
      ${H('This activation link has expired')}
      ${P('Day Zero links work once, for 10 minutes. Go back to your Day Zero account and click Activate again.')}
      ${Actions(Button('Back to Day Zero', { iconRight: 'arrow-up-right' }), Button('Email us', { v: 'ghost', cls: 'text-muted-foreground' }))}`)),
];

const rules = [
  ['Who gets Pro', 'The person who activates. Pro covers the team they own, the same way a paid plan does today. A new account gets it as soon as its team is made.'],
  ['Refund', 'Day Zero sends a deactivate. Pro comes off and the team meets the plan wall, the same as any team with no plan. Their work is kept.'],
  ['Same event twice', 'Safe. Repeats change nothing. Test events from Day Zero never touch the database.'],
  ['Upgrade, downgrade, migrate', 'Not handled yet, as Day Zero says. We answer 200 and log them.'],
];

const asks = [
  ['Already paying by card?', 'If someone on a Paystack plan activates a license, I suggest we add Pro and email you so you can cancel their card plan by hand. We would not cancel it automatically. Yes?'],
  ['Read-only or the wall on refund?', 'I suggest the wall (no plan), the same as an unpaid team. Read-only is for teams that paid us and lapsed. Yes?'],
  ['Copy', 'Are the words on these five screens right?'],
];

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Day Zero activation mocks</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* Tokens: the app's palette (apps/web/app/globals.css), as shadcn names. */
:root, [data-theme="light"] {
  --background: 247 243 236; --foreground: 26 22 17;
  --card: 252 250 246; --card-foreground: 26 22 17;
  --primary: 20 100 58; --primary-foreground: 247 243 236;
  --secondary: 236 231 222; --secondary-foreground: 26 22 17;
  --muted: 236 231 222; --muted-foreground: 98 93 85;
  --accent: 233 228 218; --accent-foreground: 26 22 17;
  --border: 226 220 209; --input: 207 200 187; --ring: 20 100 58;
  --warn: 166 98 10;
}
[data-theme="dark"] {
  --background: 12 16 13; --foreground: 245 240 230;
  --card: 20 25 21; --card-foreground: 245 240 230;
  --primary: 127 217 154; --primary-foreground: 12 16 13;
  --secondary: 30 36 31; --secondary-foreground: 245 240 230;
  --muted: 29 35 30; --muted-foreground: 160 160 151;
  --accent: 33 40 34; --accent-foreground: 245 240 230;
  --border: 36 43 37; --input: 55 62 56; --ring: 127 217 154;
  --warn: 240 182 92;
}
@tailwind base; @tailwind components; @tailwind utilities;
body { font-family: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
</style>
</head>
<body class="min-h-screen bg-zinc-200 px-4 pb-24 pt-10 dark:bg-zinc-950">
  <header class="mx-auto max-w-[880px]">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mocks · 26 Nov 2026 · issue #1393</div>
      <div class="inline-flex h-9 items-center rounded-lg bg-zinc-300/70 p-1 text-sm dark:bg-zinc-800">
        <button data-set="dark" class="theme-btn rounded-md px-3 py-1 font-medium">Dark</button>
        <button data-set="light" class="theme-btn rounded-md px-3 py-1 font-medium">Light</button>
      </div>
    </div>
    <h1 class="mt-4 text-[36px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">Day Zero: activate Pro for life</h1>
    <p class="mt-3 max-w-[65ch] text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">Someone buys Urganize on Day Zero and clicks Activate. Day Zero sends them to one page on team.urganize.app. That page has five states. Each one has a single main button.</p>

    <div class="mt-8 flex flex-wrap items-center gap-2 text-sm">
      ${[['Buy on Day Zero', 'We store the license'], ['Click Activate', 'Day Zero sends them here'], ['We check the license', 'Server side, once'], ['Sign in or new account', 'Only if signed out'], ['Pro for life', 'On their team']].map(([t, s], i, a) => `<div class="rounded-lg border px-3 py-2 ${i === a.length - 1 ? 'border-emerald-600/40 bg-emerald-600/10' : 'border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-900'}"><div class="font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="text-[12.5px] text-zinc-500">${s}</div></div>${i < a.length - 1 ? `<span class="text-zinc-400">${ic('arrow-right', 'size-4')}</span>` : ''}`).join('')}
    </div>

    <div class="mt-8 grid gap-3 sm:grid-cols-2">
      ${rules.map(([t, d]) => `<div class="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div class="font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="mt-1 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">${d}</div></div>`).join('')}
    </div>
  </header>

  <section class="mx-auto mt-16 max-w-[1180px]">
    <div class="flex flex-wrap justify-center gap-x-8 gap-y-12">${screens.join('')}</div>
  </section>

  <section class="mx-auto mt-24 max-w-[880px]">
    <h2 class="text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">What I need from you</h2>
    <ol class="mt-4 flex flex-col gap-2.5">${asks.map(([b, t], i) => `<li class="flex gap-3 rounded-xl border border-zinc-300 bg-white p-4 text-[14.5px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"><span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-[12px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">${i + 1}</span><span><b class="text-zinc-900 dark:text-zinc-100">${b}</b> ${t}</span></li>`).join('')}</ol>
    <h2 class="mt-10 text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Measured vs assumed</h2>
    <ul class="mt-3 flex flex-col gap-2 text-[14.5px] text-zinc-600 dark:text-zinc-400">
      <li><b class="text-zinc-900 dark:text-zinc-100">Measured:</b> Pro's limits (3 artists, 6 people, 3 rollouts, 450 credits) are read from the pricing code today.</li>
      <li><b class="text-zinc-900 dark:text-zinc-100">Assumed:</b> how Day Zero behaves. I could not run their wizard from here. The test activation after deploy is what proves it.</li>
    </ul>
  </section>

<script>
(function(){
  var root=document.documentElement;
  function set(t){root.setAttribute('data-theme',t);document.querySelectorAll('.theme-btn').forEach(function(b){var on=b.getAttribute('data-set')===t;b.style.background=on?(t==='dark'?'#27272a':'#fff'):'transparent';b.style.color=on?(t==='dark'?'#fafafa':'#18181b'):'#71717a';});try{localStorage.setItem('mock-theme',t)}catch(e){}}
  var saved=null;try{saved=localStorage.getItem('mock-theme')}catch(e){}
  set(saved||'dark');
  document.querySelectorAll('.theme-btn').forEach(function(b){b.addEventListener('click',function(){set(b.getAttribute('data-set'))})});
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'src.html'), html);
const cfg = `module.exports = {
  content: ['${path.join(__dirname, 'src.html')}'],
  darkMode: ['variant', '&:is([data-theme="dark"] *)'],
  theme: { extend: {
    fontFamily: { display: ['"Young Serif"', 'Georgia', 'serif'] },
    colors: Object.fromEntries(['background','foreground','card','card-foreground','primary','primary-foreground','secondary','secondary-foreground','muted','muted-foreground','accent','accent-foreground','border','input','ring','warn'].map(k => [k, 'rgb(var(--' + k + ') / <alpha-value>)'])),
  } },
};`;
fs.writeFileSync(path.join(__dirname, 'tailwind.config.js'), cfg);
const cssIn = html.match(/<style>([\s\S]*?)<\/style>/)[1];
fs.writeFileSync(path.join(__dirname, 'in.css'), cssIn);
execSync(`${path.join(__dirname, 'node_modules/.bin/tailwindcss')} -c tailwind.config.js -i in.css -o out.css --minify`, { cwd: __dirname, stdio: 'pipe' });
const css = fs.readFileSync(path.join(__dirname, 'out.css'), 'utf8');
fs.writeFileSync(OUT, html.replace(/<style>[\s\S]*?<\/style>/, `<style>${css}</style>`));
for (const f of ['src.html', 'tailwind.config.js', 'in.css', 'out.css']) fs.rmSync(path.join(__dirname, f), { force: true });
if (missing.size) console.log('MISSING ICONS:', [...missing].join(', '));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
