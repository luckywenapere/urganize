// Builds docs/mocks/credits-on-wall/mock.html (issue #1243): the ₦1,500 assistant
// option shown on the plan wall. shadcn/ui (new-york) class strings, the app's
// tokens, lucide icons, Tailwind compiled inline. Started from
// docs/mocks/song-to-review/build.js.
// Setup once: put tailwindcss@3.4.17 and lucide-static@0.460.0 in ./node_modules
// (a symlink to a folder outside the workspace works), then: node build.js
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
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-foreground underline underline-offset-4',
};
const btnS = { default: 'h-9 px-4 py-2', sm: 'h-8 rounded-md px-3 text-xs', lg: 'h-11 rounded-md px-8 text-[15px]', icon: 'h-9 w-9' };
const Button = (label, { v = 'default', s = 'default', icon, iconRight, cls = '' } = {}) =>
  `<button class="${btnBase} ${btnV[v]} ${btnS[s]} ${cls}">${icon ? ic(icon) : ''}${label}${iconRight ? ic(iconRight) : ''}</button>`;

const badgeV = {
  default: 'border-transparent bg-primary text-primary-foreground shadow',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  outline: 'text-foreground border-border',
  success: 'border-transparent bg-primary/15 text-primary',
};
const Badge = (label, v = 'secondary', icon) =>
  `<span class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeV[v]}">${icon ? ic(icon, 'size-3') : ''}${label}</span>`;

const Card = (inner, cls = '') => `<div class="rounded-xl border border-border bg-card text-card-foreground shadow ${cls}">${inner}</div>`;
const Separator = (cls = '') => `<div class="h-px w-full shrink-0 bg-border ${cls}"></div>`;

const Alert = (title, body, { icon = 'info', v = 'default' } = {}) => {
  const tone = v === 'success' ? 'border-primary/30 bg-primary/[.07] [&_svg]:text-primary' : 'border-border bg-card';
  return `<div class="relative flex w-full gap-3 rounded-lg border px-3.5 py-3 text-sm ${tone}">${ic(icon, 'size-4 mt-0.5')}<div>${title ? `<div class="mb-0.5 font-medium leading-snug">${title}</div>` : ''}<div class="text-[13px] leading-relaxed text-muted-foreground">${body}</div></div></div>`;
};

const Radio = (on) => `<span class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${on ? 'border-primary' : 'border-input'}">${on ? '<span class="h-2.5 w-2.5 rounded-full bg-primary"></span>' : ''}</span>`;

// ---------- app pieces ----------
function Phone(content, { bottom = '', overlay = '', fade = true } = {}) {
  return `<div class="relative flex h-[780px] w-[375px] max-w-full flex-col overflow-hidden rounded-[44px] border-[10px] border-zinc-900 bg-background text-foreground shadow-2xl ring-1 ring-black/10">
    <div class="flex h-11 shrink-0 items-center justify-between px-7 pt-1 text-[13px] font-semibold"><span>9:41</span><span class="flex items-center gap-1.5">${ic('signal', 'size-3.5')}${ic('wifi', 'size-3.5')}${ic('battery-full', 'size-4')}</span></div>
    <div class="relative flex-1 overflow-hidden px-4 pb-4">${content}${fade ? '<div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"></div>' : ''}</div>
    ${bottom ? `<div class="shrink-0 border-t border-border bg-background/95 px-4 pb-6 pt-3 backdrop-blur">${bottom}</div>` : ''}
    ${overlay}
  </div>`;
}

function Drawer(inner) {
  return `<div class="absolute inset-0 z-20 bg-black/50"></div>
  <div class="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[14px] border-t border-border bg-background px-4 pb-7">
    <div class="mx-auto mb-4 mt-3 h-1.5 w-12 rounded-full bg-muted"></div>${inner}</div>`;
}

const Logo = () => `<div class="flex h-11 items-center gap-2 text-[15px] font-semibold"><span class="grid h-7 w-7 place-items-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">U</span>Urganize</div>`;
const Eyebrow = (t, cls = '') => `<div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${cls}">${t}</div>`;
const H = (t, cls = '') => `<h2 class="font-display text-[26px] leading-tight ${cls}">${t}</h2>`;

// The four plans the wall offers today (packages/pricing, monthly prices).
const PLANS = [
  ['Solo', 'Just you, 1 artist', '₦5,000'],
  ['Solo Plus', 'Just you, more rollouts', '₦12,000'],
  ['Pro', 'Your team, up to 3 artists', '₦15,000'],
  ['Pro Plus', 'Your team, up to 5 artists', '₦40,000'],
];
const PICKED = 2;

// ---------- Screen 1: today ----------
const todayPlans = PLANS.map(([n, d, p], i) =>
  `<div class="flex items-start justify-between gap-3 rounded-lg border p-3.5 ${i === PICKED ? 'border-primary bg-primary/[.05]' : 'border-border bg-card'}"><div><div class="text-sm font-semibold">${n}</div><div class="mt-0.5 text-xs text-muted-foreground">${d}</div></div><div class="text-sm font-semibold">${p}<span class="font-normal text-muted-foreground">/mo</span></div></div>`).join('');

const today = Phone(`
  ${Logo()}
  <div class="mt-4 text-center">${Eyebrow('Pick a plan to start')}<div class="mt-2">${H('Run your next release like a pro.')}</div></div>
  <div class="mt-4 grid grid-cols-3 gap-2">${[['2', 'Artists'], ['1', 'Rollout'], ['14', 'Tasks']].map(([v, l]) => `<div class="rounded-2xl border border-border bg-card px-2 py-2.5 text-center"><div class="font-display text-xl">${v}</div><div class="text-[11px] text-muted-foreground">${l}</div></div>`).join('')}</div>
  <div class="mt-4 flex flex-col gap-2">${todayPlans}</div>
  ${Button('Pay ₦15,000 and start', { s: 'lg', cls: 'mt-3 w-full' })}
  <p class="mt-3 text-center text-[13px] text-muted-foreground">Running a label? <span class="font-semibold text-foreground underline underline-offset-4">Talk to us on WhatsApp</span></p>
  <p class="mt-2 text-center text-[11px] leading-5 text-muted-foreground">Prices in Naira, for your whole team. Card or bank transfer, through Paystack. Cancel any time.</p>
  <div class="mt-5 flex items-center justify-between border-t border-border pt-4 text-[13px]"><span class="text-muted-foreground">Or use AI on credits, and pay as you go.</span><span class="font-semibold underline underline-offset-4">Get credits</span></div>
`, { overlay: `<div class="absolute inset-x-4 bottom-4 z-10 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-800 dark:text-amber-300">${ic('arrow-down', 'size-3.5')}The credits line is below here, out of sight</div>` });

// ---------- Screen 2: the new wall ----------
const newPlans = PLANS.map(([n, d, p], i) =>
  `<div class="flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-border' : ''} ${i === PICKED ? 'bg-primary/[.06]' : ''}">${Radio(i === PICKED)}<div class="min-w-0 flex-1"><div class="flex items-center gap-2 text-[14.5px] font-semibold">${n}${i === PICKED ? Badge('Recommended', 'success') : ''}</div><div class="text-[12.5px] text-muted-foreground">${d}</div></div><div class="text-right text-[14.5px] font-semibold tabular-nums">${p}<div class="text-[11px] font-normal text-muted-foreground">a month</div></div></div>`).join('');

const tryCard = (cls = '') => Card(`<div class="flex gap-3 p-4">
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">${ic('sparkles', 'size-5')}</span>
    <div class="min-w-0 flex-1">
      <div class="text-[15px] font-semibold">Not ready for a plan?</div>
      <div class="mt-0.5 text-[13px] leading-snug text-muted-foreground">Try the assistant for ₦1,500. You get 50 credits. No subscription.</div>
      ${Button('Try it for ₦1,500', { v: 'outline', cls: 'mt-3 h-11 w-full' })}
    </div>
  </div>`, cls);

const wall = Phone(`
  ${Logo()}
  <div class="mt-3">${Eyebrow('Pick a plan to start')}<div class="mt-1.5">${H('Run your next release like a pro.')}</div></div>
  <div class="mt-4">${Card(newPlans, 'overflow-hidden')}</div>
  ${Button('Pay ₦15,000 and start', { s: 'lg', cls: 'mt-3 w-full' })}
  <p class="mt-2 text-center text-[11.5px] text-muted-foreground">Card or bank transfer through Paystack. Cancel any time.</p>
  <div class="my-4 flex items-center gap-3 text-[12px] text-muted-foreground">${Separator('flex-1')}or${Separator('flex-1')}</div>
  ${tryCard()}
`, { fade: false });

// ---------- Screen 3: confirm sheet ----------
const PACKS = [['₦1,500', '50 credits'], ['₦3,000', '100 credits'], ['₦7,500', '250 credits'], ['₦15,000', '500 credits']];
const sheet = Phone(`
  ${Logo()}
  <div class="mt-3">${Eyebrow('Pick a plan to start')}<div class="mt-1.5">${H('Run your next release like a pro.')}</div></div>
  <div class="mt-4">${Card(newPlans, 'overflow-hidden')}</div>
`, {
  fade: false,
  overlay: Drawer(`
    <div class="flex items-start justify-between gap-3">
      <div><div class="text-lg font-semibold tracking-tight">Try the assistant</div><div class="mt-0.5 text-[13px] text-muted-foreground">One payment. No subscription.</div></div>
      <button class="${btnBase} ${btnV.ghost} h-11 w-11 -mr-3 text-muted-foreground">${ic('x')}</button>
    </div>
    <div class="mt-4 grid grid-cols-2 gap-2">${PACKS.map(([p, c], i) => `<div class="rounded-lg border px-3 py-2.5 ${i === 0 ? 'border-primary bg-primary/[.07] ring-1 ring-primary' : 'border-border'}"><div class="text-[15px] font-semibold tabular-nums">${p}</div><div class="text-[12.5px] text-muted-foreground">${c}</div></div>`).join('')}</div>
    <div class="mt-4 flex flex-col gap-2 text-[13.5px]">
      <div class="flex items-center gap-2.5">${ic('message-circle', 'size-4 text-muted-foreground')}<span>About 50 quick questions, or about 15 longer answers</span></div>
      <div class="flex items-center gap-2.5">${ic('lock', 'size-4 text-muted-foreground')}<span class="text-muted-foreground">The assistant only. A plan opens rollouts and your team.</span></div>
    </div>
    ${Button('Pay ₦1,500 with Paystack', { s: 'lg', cls: 'mt-5 w-full' })}
    <p class="mt-2 text-center text-[11.5px] text-muted-foreground">Card or bank transfer. Credits are added as soon as you pay.</p>
  `),
});

// ---------- Screen 4: after paying ----------
const chip = (t) => `<span class="inline-flex min-h-10 items-center rounded-full border border-border bg-card px-3.5 text-[13px] shadow-sm">${t}</span>`;
const after = Phone(`
  <div class="flex h-11 items-center justify-between"><div class="flex items-center gap-1"><button class="${btnBase} ${btnV.ghost} h-11 w-11 -ml-3 text-muted-foreground">${ic('chevron-left')}</button><div class="text-[17px] font-semibold">Assistant</div></div>${Badge('50 credits', 'outline', 'coins')}</div>
  <div class="mt-2">${Alert('Payment received', '50 credits added. Ask anything about your release.', { icon: 'circle-check', v: 'success' })}</div>
  <div class="mt-8 flex flex-col items-center text-center">
    <span class="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">${ic('sparkles', 'size-6')}</span>
    <div class="mt-3 text-[17px] font-semibold">What can I help with?</div>
    <div class="mt-1 text-[13px] text-muted-foreground">Quick questions cost 1 credit.</div>
  </div>
  <div class="mt-5 flex flex-wrap justify-center gap-2">${['Plan my next single', 'Write a pitch to a curator', 'What should I post this week?', 'Draft an email to a blog'].map(chip).join('')}</div>
  <div class="mt-8 rounded-lg border border-dashed border-border px-3.5 py-3 text-center text-[12.5px] text-muted-foreground">Want rollouts and your team too? A plan gives you more credits for the money. <span class="font-semibold text-foreground underline underline-offset-4">See plans</span></div>
`, {
  fade: false,
  bottom: `<div class="flex h-11 items-center gap-2 rounded-xl border border-input bg-card px-3 text-[15px] text-muted-foreground shadow-sm"><span class="flex-1">Ask the assistant</span><span class="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">${ic('arrow-up')}</span></div>`,
});

// ---------- page ----------
const Screen = (n, title, why, phone, tag = '') =>
  `<figure class="flex w-[375px] max-w-full flex-col gap-3"><figcaption class="min-h-[84px]"><div class="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100"><span class="inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">${n}</span>${title}${tag}</div><div class="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">${why}</div></figcaption>${phone}</figure>`;
const Tag = (t, on) => `<span class="rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${on ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' : 'bg-zinc-300 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}">${t}</span>`;

const changes = [
  ['Seen without scrolling', 'Today the credits line is the last thing on the wall, under the label line and the small print. Now it sits right under the plans, inside the first screen.'],
  ['A price, not a vague offer', '“Get credits” becomes “Try it for ₦1,500”. People know what it costs before they tap.'],
  ['Plans still lead', 'The plan button stays the one filled button. The ₦1,500 card uses an outline button, so it is the second choice, not a rival.'],
  ['Pay in one step', 'Today the line opens a separate page, then you pick a pack. Now a sheet opens on the wall with ₦1,500 already picked.'],
  ['Clear about what it opens', 'The sheet says it is the assistant only, so nobody pays expecting rollouts.'],
  ['A road back to a plan', 'After paying, the assistant shows the balance and one quiet line pointing to plans.'],
];
const asks = [
  ['The words', '“Not ready for a plan? Try the assistant for ₦1,500.” Keep, or change?'],
  ['Bigger packs in the sheet', 'Show all four packs, or only ₦1,500 to keep it simple?'],
  ['Where else', 'Also put the same card on the pricing page and the plans screen in onboarding, or the wall only for now?'],
];

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Credits on the wall</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
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
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mocks v1 · 12 Nov 2026 · issue #1243</div>
      <div class="inline-flex h-9 items-center rounded-lg bg-zinc-300/70 p-1 text-sm dark:bg-zinc-800">
        <button data-set="dark" class="theme-btn rounded-md px-3 py-1 font-medium">Dark</button>
        <button data-set="light" class="theme-btn rounded-md px-3 py-1 font-medium">Light</button>
      </div>
    </div>
    <h1 class="mt-4 text-[36px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">Try the assistant for ₦1,500, right on the wall</h1>
    <p class="mt-3 max-w-[65ch] text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">Someone without a plan can already buy credits and use the assistant. Today that option is one small line at the bottom of the plan wall. This puts it on the wall itself, with its price, as a clear second choice under the plans. Nothing else changes: credits still open the assistant only. Names and numbers are made up.</p>
    <div class="mt-8 text-xs font-semibold uppercase tracking-wider text-zinc-500">What’s better than today</div>
    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      ${changes.map(([t, d]) => `<div class="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div class="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">${d}</div></div>`).join('')}
    </div>
  </header>

  <section class="mx-auto mt-16 max-w-[1660px]">
    <div class="flex flex-wrap justify-center gap-x-8 gap-y-12">
      ${Screen(1, 'The wall today', 'The credits line is the very last thing, under the small print. It says “Get credits” with no price.', today, Tag('Today', false))}
      ${Screen(2, 'The new wall', 'Plans first, one filled button. Under it, a card with the price: try the assistant for ₦1,500.', wall, Tag('New', true))}
      ${Screen(3, 'One tap, then pay', 'A sheet opens on the wall with ₦1,500 picked. It says what 50 credits buys and that it is the assistant only.', sheet, Tag('New', true))}
      ${Screen(4, 'Straight into the assistant', 'After Paystack, the person lands in the assistant with the balance showing and one quiet line about plans.', after, Tag('New', true))}
    </div>
  </section>

  <section class="mx-auto mt-20 max-w-[880px]">
    <h2 class="text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">What I need from you</h2>
    <ol class="mt-4 flex flex-col gap-2.5">${asks.map(([b, t], i) => `<li class="flex gap-3 rounded-xl border border-zinc-300 bg-white p-4 text-[14.5px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"><span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-[12px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">${i + 1}</span><span><b class="text-zinc-900 dark:text-zinc-100">${b}.</b> ${t}</span></li>`).join('')}</ol>
    <h2 class="mt-10 text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Measured vs assumed</h2>
    <ul class="mt-3 flex flex-col gap-2 text-[14.5px] text-zinc-600 dark:text-zinc-400">
      <li><b class="text-zinc-900 dark:text-zinc-100">Measured:</b> the packs and prices (₦1,500 buys 50 credits without a plan), that buying is switched on in production, and where the credits line sits on today’s wall. A quick question costs 1 credit and a longer answer about 3.</li>
      <li><b class="text-zinc-900 dark:text-zinc-100">Assumed:</b> that most people never see today’s line. There is no click data for it.</li>
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
fs.writeFileSync(path.join(__dirname, 'in.css'), html.match(/<style>([\s\S]*?)<\/style>/)[1]);
execSync(`${path.join(__dirname, 'node_modules/.bin/tailwindcss')} -c tailwind.config.js -i in.css -o out.css --minify`, { cwd: __dirname, stdio: 'pipe' });
const css = fs.readFileSync(path.join(__dirname, 'out.css'), 'utf8');
fs.writeFileSync(OUT, html.replace(/<style>[\s\S]*?<\/style>/, `<style>${css}</style>`));
for (const f of ['src.html', 'tailwind.config.js', 'in.css', 'out.css']) fs.rmSync(path.join(__dirname, f), { force: true });
if (missing.size) console.log('MISSING ICONS:', [...missing].join(', '));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
