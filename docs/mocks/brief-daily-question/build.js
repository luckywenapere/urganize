// Builds docs/mocks/brief-daily-question/mock.html from shadcn/ui (new-york) class strings,
// the app's tokens, lucide icons, and Tailwind compiled inline. Based on ../song-to-review/build.js.
// Setup once in this folder: npm i --no-save tailwindcss@3.4.17 lucide-static@0.460.0, then: node build.js
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
};
const btnS = { default: 'h-9 px-4 py-2', sm: 'h-8 rounded-md px-3 text-xs', lg: 'h-11 rounded-md px-8 text-[15px]', icon: 'h-9 w-9' };
const Button = (label, { v = 'default', s = 'default', icon, iconRight, cls = '' } = {}) =>
  `<button class="${btnBase} ${btnV[v]} ${btnS[s]} ${cls}">${icon ? ic(icon) : ''}${label}${iconRight ? ic(iconRight) : ''}</button>`;

const badgeV = {
  default: 'border-transparent bg-primary text-primary-foreground shadow',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  outline: 'text-foreground border-border',
  success: 'border-transparent bg-primary/15 text-primary',
  warn: 'border-transparent bg-warn/15 text-warn',
};
const Badge = (label, v = 'secondary', icon) =>
  `<span class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeV[v]}">${icon ? ic(icon, 'size-3') : ''}${label}</span>`;

const Card = (inner, cls = '') => `<div class="rounded-xl border border-border bg-card text-card-foreground shadow ${cls}">${inner}</div>`;
const CardHeader = (title, desc, right = '') =>
  `<div class="flex items-start justify-between gap-3 p-4 pb-2"><div class="flex flex-col gap-0.5"><div class="font-semibold leading-none tracking-tight">${title}</div>${desc ? `<div class="text-[13px] text-muted-foreground">${desc}</div>` : ''}</div>${right}</div>`;

const Checkbox = (on) => on
  ? `<span class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border border-primary bg-primary text-primary-foreground shadow">${ic('check', 'size-3.5')}</span>`
  : `<span class="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-input shadow-sm"></span>`;

const Progress = (pct, cls = '') =>
  `<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/15 ${cls}"><div class="h-full bg-primary" style="width:${pct}%"></div></div>`;

const Separator = (cls = '') => `<div class="h-px w-full shrink-0 bg-border ${cls}"></div>`;

const tones = {
  AB: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  KO: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  TV: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  DJ: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};
const Avatar = (i, size = 'h-7 w-7 text-[11px]') =>
  `<span class="relative flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${tones[i] || 'bg-muted text-muted-foreground'}">${i}</span>`;

const Input = (value, { placeholder = '', icon, cls = '', suffix = '' } = {}) =>
  `<div class="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-[15px] shadow-sm ${cls}">${icon ? `<span class="text-muted-foreground">${ic(icon)}</span>` : ''}<span class="flex-1 truncate ${value ? '' : 'text-muted-foreground'}">${value || placeholder}</span>${suffix}</div>`;

const Label = (t, cls = '') => `<div class="text-sm font-medium leading-none ${cls}">${t}</div>`;

const Tabs = (items, active) =>
  `<div class="inline-flex h-9 w-full items-center rounded-lg bg-muted p-1 text-muted-foreground">${items.map((t, i) => `<span class="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ${i === active ? 'bg-background text-foreground shadow' : ''}">${t}</span>`).join('')}</div>`;

const ToggleGroup = (items, active) =>
  `<div class="flex flex-wrap gap-2">${items.map((t, i) => `<span class="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium ${i === active ? 'border-primary bg-primary/10 text-primary' : 'border-input text-foreground shadow-sm'}">${t}</span>`).join('')}</div>`;

const Alert = (title, body, { icon = 'info', v = 'default' } = {}) => {
  const tone = v === 'success' ? 'border-primary/30 bg-primary/[.07] [&_svg]:text-primary' : v === 'warn' ? 'border-warn/30 bg-warn/[.08] [&_svg]:text-warn' : 'border-border bg-card';
  return `<div class="relative flex w-full gap-3 rounded-lg border px-3.5 py-3 text-sm ${tone}">${ic(icon, 'size-4 mt-0.5')}<div>${title ? `<div class="mb-0.5 font-medium leading-snug">${title}</div>` : ''}<div class="text-[13px] leading-relaxed text-muted-foreground">${body}</div></div></div>`;
};

// ---------- app pieces ----------
function Phone(content, { bottom = '', overlay = '' } = {}) {
  return `<div class="relative flex h-[780px] w-[375px] max-w-full flex-col overflow-hidden rounded-[44px] border-[10px] border-zinc-900 bg-background text-foreground shadow-2xl ring-1 ring-black/10">
    <div class="flex h-11 shrink-0 items-center justify-between px-7 pt-1 text-[13px] font-semibold"><span>8:04</span><span class="flex items-center gap-1.5">${ic('signal', 'size-3.5')}${ic('wifi', 'size-3.5')}${ic('battery-full', 'size-4')}</span></div>
    <div class="relative flex-1 overflow-hidden px-4">${content}</div>
    ${bottom ? `<div class="shrink-0 border-t border-border bg-background px-4 pb-6 pt-3">${bottom}</div>` : ''}
    ${overlay}
  </div>`;
}

const ChatTop = () =>
  `<div class="flex h-12 items-center justify-between border-b border-border -mx-4 px-4"><div class="flex items-center gap-2"><span class="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">${ic('sparkles', 'size-3.5')}</span><span class="font-semibold">Assistant</span></div><button class="${btnBase} ${btnV.ghost} h-9 w-9 text-muted-foreground">${ic('ellipsis')}</button></div>`;

const Composer = () =>
  `<div class="flex h-11 items-center gap-2 rounded-full border border-input bg-card pl-4 pr-1.5 shadow-sm"><span class="flex-1 text-[14px] text-muted-foreground">Ask anything</span><span class="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">${ic('arrow-up', 'size-4')}</span></div>`;

const DayRule = (t) =>
  `<div class="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span class="h-px flex-1 bg-border"></span>${t}<span class="h-px flex-1 bg-border"></span></div>`;

const Me = (t) => `<div class="flex justify-end"><div class="max-w-[80%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-[14px]">${t}</div></div>`;
const Ai = (t) => `<div class="max-w-[92%] text-[14px] leading-relaxed">${t}</div>`;

const dotTone = { late: 'bg-red-600 dark:bg-red-400', good: 'bg-primary', plain: 'bg-muted-foreground/50' };
const Item = (text, meta, tone = 'plain', first = false) =>
  `<div class="flex items-start gap-2.5 py-2 ${first ? '' : 'border-t border-border'}"><span class="mt-[7px] h-2 w-2 shrink-0 rounded-full ${dotTone[tone]}"></span><span class="min-w-0 flex-1 text-[14px]">${text}</span>${meta ? `<span class="shrink-0 text-[12px] ${tone === 'late' ? 'font-semibold text-red-700 dark:text-red-400' : 'text-muted-foreground'}">${meta}</span>` : ''}</div>`;

const Section = (title, items) =>
  `<div class="mt-4"><div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">${title}</div><div class="mt-0.5">${items.map((it, i) => Item(it[0], it[1], it[2] || 'plain', i === 0)).join('')}</div></div>`;

// The question block: the new part. Sits inside the brief, after "One thing first".
function Question(q, choices, { picked = -1, note = '', compact = false } = {}) {
  const chip = (c, i) => {
    const on = i === picked, off = picked >= 0 && !on;
    return `<span class="inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium ${on ? 'border-primary bg-primary text-primary-foreground' : off ? 'border-border text-muted-foreground' : 'border-input bg-background shadow-sm'}">${on ? ic('check', 'size-3.5') : ''}${c}</span>`;
  };
  return `<div class="mt-4 border-t border-dashed border-input pt-4">
    <div class="flex items-center gap-1.5 text-[12px] font-semibold text-primary">${ic('message-circle-question', 'size-3.5')}Today's question</div>
    <div class="mt-1 text-[15px] font-semibold leading-snug">${q}</div>
    <div class="mt-3 flex flex-wrap gap-2">${choices.map(chip).join('')}</div>
    ${picked < 0 ? `<div class="mt-1.5 flex items-center justify-between text-[12.5px] text-muted-foreground"><span>${note || 'Or type your answer below.'}</span><span class="-mr-2 inline-flex h-10 items-center rounded-md px-2 font-medium text-foreground/80">Not now</span></div>` : ''}
  </div>`;
}

function Brief({ greeting, lede, sections, next, tag = '', question = '' }) {
  return `<div class="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
    <div class="flex items-baseline justify-between gap-3"><div class="font-display text-[19px]">${greeting}</div><span class="text-[12px] text-muted-foreground">Morning brief</span></div>
    <p class="mt-1 text-[13.5px] leading-6 text-muted-foreground">${lede}</p>
    ${tag}
    ${sections.map(([t, items]) => Section(t, items)).join('')}
    ${next ? `<div class="mt-4 flex items-center justify-between gap-3 rounded-xl bg-primary/10 px-3.5 py-3"><p class="text-[13.5px]"><b class="font-semibold">One thing first:</b> ${next}</p><span class="inline-flex min-h-9 shrink-0 items-center rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">Open</span></div>` : ''}
    ${question}
  </div>`;
}

const Tag = (t) =>
  `<div class="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px]"><span class="flex items-center gap-1.5">${ic('sliders-horizontal', 'size-3.5 text-primary')}${t}</span><span class="font-medium text-primary">Change</span></div>`;

const Screen = (n, title, why, phone) =>
  `<figure class="flex w-[375px] max-w-full flex-col gap-3"><figcaption class="min-h-[64px]"><div class="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100"><span class="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">${n}</span>${title}</div><div class="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">${why}</div></figcaption>${phone}</figure>`;

const Flow = (tag, title, desc, screens) =>
  `<section class="mx-auto mt-20 max-w-[1240px]"><div class="mx-auto mb-8 max-w-[880px]"><div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">${tag}</div><h2 class="mt-1 text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">${title}</h2><p class="mt-1.5 max-w-[65ch] text-[15px] text-zinc-600 dark:text-zinc-400">${desc}</p></div><div class="flex flex-wrap justify-center gap-x-8 gap-y-12">${screens.join('')}</div></section>`;

// ---------- data (made up) ----------
const d2Needs = [
  ['Send cover art to the distributor · Lagos Rain', '2 days late', 'late'],
  ['Book the radio run · Lagos Rain', 'Due today'],
];
const d2Changed = [
  ['Tobi finished Mix approved', 'Lagos Rain', 'good'],
  ['Ada finished Press photos picked', 'Okada', 'good'],
];
const d2Up = [['Lagos Rain is out', 'Fri 27 Nov'], ['Okada pre-save opens', 'Mon 30 Nov']];

const Q1 = 'What do you want at the top each morning?';
const Q1c = ['What\'s late', 'Release days', 'What the team did'];

// ---------- FLOW 1 ----------
const f1 = [
  Screen(1, 'Day 2: the brief ends with one question', 'Same brief as today. The new part is under the dashed line: one question, three taps. No question on day 1, so the first brief is just useful.', Phone(`
    ${ChatTop()}
    ${DayRule('Tuesday 17 Nov')}
    ${Brief({
      greeting: 'Good morning, Kemi',
      lede: 'One thing is late on Lagos Rain. The rest is on track.',
      sections: [['Needs you today', d2Needs]],
      next: 'send the cover art, it blocks the release.',
      question: Question(Q1, Q1c),
    })}`, { bottom: Composer() })),

  Screen(2, 'She taps an answer', 'Her tap shows as her own message, so the chat reads like a conversation. The reply says exactly what will change, and when. Undo is right there.', Phone(`
    ${ChatTop()}
    <div class="pointer-events-none relative -mt-1 h-[300px] overflow-hidden opacity-100">
      <div class="absolute inset-x-0 bottom-0">${Brief({
        greeting: 'Good morning, Kemi',
        lede: 'One thing is late on Lagos Rain. The rest is on track.',
        sections: [['Since yesterday', d2Changed]],
        next: 'send the cover art, it blocks the release.',
        question: Question(Q1, Q1c, { picked: 0 }),
      })}</div>
      <div class="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent"></div>
    </div>
    <div class="mt-4 flex flex-col gap-3">
      ${Me('What\'s late')}
      ${Ai(`Got it. From tomorrow, late work goes at the top of your brief.<div class="mt-2 flex gap-2">${Button('Undo', { v: 'outline', cls: 'h-10' })}${Button('See settings', { v: 'ghost', cls: 'h-10' })}</div>`)}
    </div>`, { bottom: Composer() })),

  Screen(3, 'Day 3: the brief follows her answer', 'Late work leads, and a small line says why, with Change. Then a new question, about her artists this time. One a day, never more.', Phone(`
    ${ChatTop()}
    ${DayRule('Wednesday 18 Nov')}
    ${Brief({
      greeting: 'Good morning, Kemi',
      lede: 'Two things are late. Lagos Rain is out in 9 days.',
      tag: Tag('Late work first, like you asked'),
      sections: [['Late', [['Send cover art to the distributor · Lagos Rain', '3 days late', 'late'], ['Approve the Okada teaser', '1 day late', 'late']]], ['Since yesterday', [['Tobi finished Radio run booked', 'Lagos Rain', 'good']]]],
      question: Question('Which artist matters most this month?', ['Ayo Banks', 'Dami', 'Both the same']),
    })}`, { bottom: Composer() })),

  Screen(4, 'Everything it learned, in one place', 'By Thursday, three answers. Settings, Notifications, Morning brief. Each answer is a line she can change or clear. Nothing is hidden, so it never feels like it is guessing.', Phone(`
    <div class="flex h-12 items-center gap-1 -mx-1">${Button('Settings', { v: 'ghost', icon: 'chevron-left', cls: 'px-2 text-muted-foreground' })}</div>
    <h2 class="font-display text-[26px] leading-tight">Morning brief</h2>
    <p class="mt-1 text-[13.5px] text-muted-foreground">Waits in your Assistant chat at 8am.</p>
    ${Card(`<div class="flex items-center justify-between p-4"><div><div class="text-[15px] font-medium">Morning brief</div><div class="text-[12.5px] text-muted-foreground">Every day at 8am</div></div><span class="flex h-6 w-11 items-center rounded-full bg-primary p-0.5"><span class="ml-auto h-5 w-5 rounded-full bg-background shadow"></span></span></div><div class="h-px bg-border"></div><div class="flex items-center justify-between p-4"><div><div class="text-[15px] font-medium">A question each day</div><div class="text-[12.5px] text-muted-foreground">So the brief fits how you work</div></div><span class="flex h-6 w-11 items-center rounded-full bg-primary p-0.5"><span class="ml-auto h-5 w-5 rounded-full bg-background shadow"></span></span></div>`, 'mt-5')}
    <div class="mt-6 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">What you told the Assistant</div>
    ${Card(`<div class="px-4">${[['At the top', 'What\'s late', '17 Nov'], ['Focus artist', 'Ayo Banks', '18 Nov'], ['Also show', 'Work due this week', '19 Nov']].map(([k, v, d], i) => `<div class="flex items-center gap-3 py-3 ${i ? 'border-t border-border' : ''}"><div class="min-w-0 flex-1"><div class="text-[12.5px] text-muted-foreground">${k}</div><div class="text-[15px] font-medium">${v}</div></div><span class="text-[12px] text-muted-foreground">${d}</span><span class="text-muted-foreground">${ic('pencil', 'size-4')}</span></div>`).join('')}</div>`, 'mt-2')}
    <div class="mt-3">${Button('Clear all answers', { v: 'ghost', cls: 'text-muted-foreground -ml-3' })}</div>`)),
];

// ---------- FLOW 2: the computer ----------
const desk = `<div class="mx-auto mt-2 w-full max-w-[1100px] overflow-hidden rounded-2xl border border-zinc-300 bg-background text-foreground shadow-2xl dark:border-zinc-800">
  <div class="flex h-14 items-center gap-5 border-b border-border px-5">
    <span class="font-display text-[18px]">Urganize</span>
    <div class="flex gap-1 text-[13.5px] font-medium">${['Home', 'Assistant', 'Rollouts'].map((t, i) => `<span class="rounded-full px-3.5 py-1.5 ${i === 1 ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground'}">${t}</span>`).join('')}</div>
    <span class="ml-auto flex h-9 w-60 items-center gap-2 rounded-full border border-border px-3 text-[13px] text-muted-foreground">${ic('search', 'size-4')}Search</span>
  </div>
  <div class="mx-auto flex max-w-[720px] flex-col gap-3 px-6 pb-6">
    ${DayRule('Thursday 19 Nov')}
    ${Brief({
      greeting: 'Good morning, Kemi',
      lede: 'Ayo Banks first, like you asked. Lagos Rain is out in 8 days and one thing is still late.',
      tag: Tag('Late work first · Ayo Banks first'),
      sections: [['Late', [['Send cover art to the distributor · Lagos Rain', '4 days late', 'late']]], ['Since yesterday', [['Tobi finished Radio run booked', 'Lagos Rain', 'good'], ['Ada finished Teaser cut', 'Okada', 'good']]], ['Coming up for Ayo Banks', [['Lagos Rain is out', 'Fri 27 Nov']]]],
      next: 'send the cover art today. Every day late pushes the store date.',
      question: Question('Want work due later this week in here too, or only today?', ['This week too', 'Only today']),
    })}
    <div class="mt-2">${Composer()}</div>
  </div>
</div>`;

// ---------- the question list ----------
const questions = [
  ['Day 2', 'What do you want at the top each morning?', 'What\'s late / Release days / What the team did', 'The order of the brief.'],
  ['Day 3', 'Which artist matters most this month?', 'Their artists, or "Both the same"', 'That artist\'s work leads. Asked again each new month.'],
  ['Day 4', 'Want work due later this week in here too?', 'This week too / Only today', 'How far ahead "Needs you" looks.'],
  ['Day 5', 'Who on the team should I keep an eye on for you?', 'Their teammates, or "No one"', 'Adds "Waiting on Tobi" lines for that person\'s late work.'],
  ['After that', 'Only when something new happens', 'For example a new artist added, or a release just went out', 'Day after release: "Want how Lagos Rain is doing in your brief this week?"'],
];

const rules = [
  ['One question a day, at most', 'Starts on day 2. The first brief is just useful, no asking.'],
  ['Every answer changes tomorrow', 'If an answer would change nothing anyone can see, we don\'t ask it.'],
  ['Skipped means quiet', 'No answer yesterday, no question today. Two skips in a row and it waits a week.'],
  ['Nothing hidden', 'Every answer is listed in Settings, with a way to change or clear it. One switch turns the questions off.'],
  ['No streaks, no counters', 'People come back because tomorrow\'s brief is shaped by what they said.'],
  ['No AI needed', 'The questions and what each answer does are written in code. AI can reword, never invent a question.'],
];

const better = [
  ['The brief asks, not only tells', 'Today the brief is one-way. Now it ends with a question you can answer in one tap.'],
  ['The reason is on screen', 'A small line under the opening says why the brief looks this way, with Change next to it.'],
  ['Tap targets you can hit', 'Answer buttons are 40px tall, full width on a phone, and the picked one is clearly marked.'],
];
// ---------- page ----------
const box = 'rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900';
const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>One question a day</title>
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
<body class="min-h-screen overflow-x-hidden bg-zinc-200 px-4 pb-24 pt-10 dark:bg-zinc-950">
  <header class="mx-auto max-w-[880px]">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mock · 15 Nov 2026 · issue #1314</div>
      <div class="inline-flex h-9 items-center rounded-lg bg-zinc-300/70 p-1 text-sm dark:bg-zinc-800">
        <button data-set="dark" class="theme-btn rounded-md px-3 py-1 font-medium">Dark</button>
        <button data-set="light" class="theme-btn rounded-md px-3 py-1 font-medium">Light</button>
      </div>
    </div>
    <h1 class="mt-4 text-[36px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">One question a day</h1>
    <p class="mt-3 max-w-[65ch] text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">From day 2, the morning brief ends with one short question. You answer in one tap. Tomorrow's brief changes because of what you said, and tells you so. That is the reason to come back, not a streak. Names and numbers are made up.</p>
    <div class="mt-8 flex flex-wrap items-center gap-2 text-sm">
      ${[['8am', 'Brief arrives'], ['One question', 'Three taps to answer'], ['Saved', 'Listed in Settings'], ['Next morning', 'Brief follows the answer']].map(([t, s], i, a) => `<div class="rounded-lg border px-3 py-2 ${i === a.length - 1 ? 'border-emerald-600/40 bg-emerald-600/10' : 'border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-900'}"><div class="font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="text-[12.5px] text-zinc-500">${s}</div></div>${i < a.length - 1 ? `<span class="text-zinc-400">${ic('arrow-right', 'size-4')}</span>` : ''}`).join('')}
    </div>
    <div class="mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-500">The rules</div>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      ${rules.map(([t, d]) => `<div class="${box}"><div class="font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="mt-1 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">${d}</div></div>`).join('')}
    </div>
    <div class="mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-500">Better than today's brief</div>
    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      ${better.map(([t, d]) => `<div class="${box}"><div class="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">${d}</div></div>`).join('')}
    </div>
  </header>

  ${Flow('Flow 1 of 2 · phone', 'Kemi\'s first four days', 'Kemi manages Ayo Banks and Dami. She signed up on Monday. This is Tuesday to Thursday in her Assistant chat.', f1)}

  <section class="mx-auto mt-20 max-w-[1240px]">
    <div class="mx-auto mb-8 max-w-[880px]"><div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Flow 2 of 2 · computer</div><h2 class="mt-1 text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Day 4 on a computer</h2><p class="mt-1.5 max-w-[65ch] text-[15px] text-zinc-600 dark:text-zinc-400">Two answers in. Late work leads, Ayo Banks leads, and "Coming up" shows only Ayo's dates. Day 4's question sits at the end.</p></div>
    ${desk}
  </section>

  <section class="mx-auto mt-20 max-w-[880px]">
    <h2 class="text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">The questions, in order</h2>
    <p class="mt-1.5 text-[14.5px] text-zinc-600 dark:text-zinc-400">Each one changes something you can see the next morning. A question is skipped if it doesn't fit (one artist means no artist question).</p>
    <div class="mt-4 overflow-x-auto rounded-xl border border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table class="w-full min-w-[640px] text-left text-[13.5px]">
        <thead class="text-[12px] uppercase tracking-wider text-zinc-500"><tr>${['When', 'Question', 'Answers', 'What it changes'].map((h) => `<th class="px-4 py-3 font-semibold">${h}</th>`).join('')}</tr></thead>
        <tbody>${questions.map((r) => `<tr class="border-t border-zinc-200 dark:border-zinc-800">${r.map((c, i) => `<td class="px-4 py-3 align-top ${i === 1 ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>

    <h2 class="mt-12 text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Measured vs assumed</h2>
    <ul class="mt-3 flex flex-col gap-2 text-[14.5px] text-zinc-600 dark:text-zinc-400">
      <li><b class="text-zinc-900 dark:text-zinc-100">Measured (in the code today):</b> the brief already arrives at 8am Lagos, once per person per day, with Needs you, Since yesterday, Coming up and One thing first. It has an off switch in Settings.</li>
      <li><b class="text-zinc-900 dark:text-zinc-100">Assumed:</b> that a question people can answer in one tap brings them back more than the brief alone. We have no numbers on brief opens yet, so we would count opens and answers from day one.</li>
      <li><b class="text-zinc-900 dark:text-zinc-100">New to build:</b> a place to keep each person's answers, the question list, and the brief reading those answers. No new screen besides the Settings list.</li>
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
if (missing.size) console.log('MISSING ICONS:', [...missing].join(', '));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
