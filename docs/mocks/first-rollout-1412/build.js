// Builds docs/mocks/first-rollout-1412/mock.html (issue #1412) from shadcn/ui (new-york)
// class strings, the app's tokens, lucide icons, and Tailwind compiled inline.
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

// ---------- shadcn/ui (new-york) primitives ----------
const btnBase = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const btnV = {
  default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-foreground underline underline-offset-4',
};
const btnS = { default: 'h-9 px-4 py-2', sm: 'h-8 rounded-md px-3 text-xs', lg: 'h-11 rounded-md px-8 text-[15px] font-semibold', icon: 'h-9 w-9' };
const Button = (label, { v = 'default', s = 'default', icon, iconRight, cls = '' } = {}) =>
  `<button class="${btnBase} ${btnV[v]} ${btnS[s]} ${cls}">${icon ? ic(icon) : ''}${label}${iconRight ? ic(iconRight) : ''}</button>`;

const badgeV = {
  default: 'border-transparent bg-primary text-primary-foreground shadow',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  outline: 'text-foreground border-input',
  success: 'border-transparent bg-primary/15 text-primary',
  warn: 'border-transparent bg-warn/15 text-warn',
  destructive: 'border-transparent bg-destructive/10 text-destructive',
};
const Badge = (label, v = 'secondary', icon) =>
  `<span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeV[v]}">${icon ? ic(icon, 'size-3') : ''}${label}</span>`;

const Card = (inner, cls = '') => `<div class="rounded-xl border border-border bg-card text-card-foreground shadow ${cls}">${inner}</div>`;

const Checkbox = (on) => on
  ? `<span class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border border-primary bg-primary text-primary-foreground shadow">${ic('check', 'size-3.5')}</span>`
  : `<span class="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-input shadow-sm"></span>`;

const Avatar = (i, tone = 'bg-muted text-muted-foreground', size = 'h-8 w-8 text-[11px]') =>
  `<span class="relative flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${tone}">${i}</span>`;

const Input = (value, { placeholder = '', icon, cls = '', suffix = '' } = {}) =>
  `<div class="flex h-11 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-[15px] shadow-sm ${cls}">${icon ? `<span class="text-muted-foreground">${ic(icon)}</span>` : ''}<span class="flex-1 truncate ${value ? '' : 'text-muted-foreground'}">${value || placeholder}</span>${suffix}</div>`;

const Label = (t, cls = '') => `<div class="text-sm font-medium leading-none ${cls}">${t}</div>`;

// ToggleGroup, type="single", variant="outline": one answer, one tap.
const Seg = (items, active) =>
  `<div class="flex gap-1.5">${items.map((t, i) => `<span class="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border px-1.5 text-[13px] font-medium ${i === active ? 'border-primary bg-primary/10 text-primary' : 'border-input text-foreground shadow-sm'}">${t}</span>`).join('')}</div>`;

const Alert = (title, body, { icon = 'info', v = 'default', cls = '' } = {}) => {
  const tone = v === 'success' ? 'border-primary/30 bg-primary/[.07] [&_svg]:text-primary' : v === 'warn' ? 'border-warn/30 bg-warn/[.08] [&_svg]:text-warn' : 'border-border bg-card';
  return `<div class="relative flex w-full gap-3 rounded-lg border px-3.5 py-3 text-sm ${tone} ${cls}">${ic(icon, 'size-4 mt-0.5')}<div>${title ? `<div class="font-medium leading-snug">${title}</div>` : ''}${body ? `<div class="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">${body}</div>` : ''}</div></div>`;
};

// ---------- app pieces ----------
function Phone(content, { bottom = '', overlay = '' } = {}) {
  return `<div class="relative flex h-[760px] w-[375px] max-w-full flex-col overflow-hidden rounded-[44px] border-[10px] border-zinc-900 bg-background text-foreground shadow-2xl ring-1 ring-black/10">
    <div class="flex h-11 shrink-0 items-center justify-between px-7 pt-1 text-[13px] font-semibold"><span>9:41</span><span class="flex items-center gap-1.5">${ic('signal', 'size-3.5')}${ic('wifi', 'size-3.5')}${ic('battery-full', 'size-4')}</span></div>
    <div class="relative flex-1 overflow-hidden px-4 pb-4">${content}</div>
    ${bottom ? `<div class="shrink-0 bg-background px-4 pb-6 pt-3">${bottom}</div>` : ''}
    ${overlay}
  </div>`;
}

const H = (t, cls = '') => `<h2 class="text-[24px] font-bold leading-tight tracking-tight ${cls}">${t}</h2>`;
const Muted = (t, cls = '') => `<p class="text-[14px] leading-relaxed text-muted-foreground ${cls}">${t}</p>`;
const Field = (label, control, cls = 'mt-4') => `<div class="${cls}">${Label(label)}<div class="mt-2">${control}</div></div>`;
const StepDots = (n, of) =>
  `<div class="flex items-center gap-1.5">${Array.from({ length: of }, (_, i) => `<span class="h-1.5 rounded-full ${i < n ? 'w-6 bg-primary' : 'w-1.5 bg-input'}"></span>`).join('')}</div>`;

// Sign-up screens: wordmark, nothing else to tap.
const SetupBar = (right = '') => `<div class="flex h-11 items-center justify-between"><span class="text-[17px] font-bold tracking-tight">Urganize</span>${right}</div>`;
// The app's phone header: Home and Ask Chappi.
const AppBar = (initials) =>
  `<div class="flex h-11 items-center justify-between"><div class="flex items-end gap-5"><span class="border-b-2 border-primary pb-1 text-[17px] font-bold tracking-tight">Home</span><span class="pb-1 text-[17px] font-bold tracking-tight text-muted-foreground">Ask Chappi</span></div>${Avatar(initials, 'bg-primary text-primary-foreground')}</div>`;

const RolloutTitle = (name, count, meta, badge = '') =>
  `<div class="mt-3"><div class="flex items-center gap-2"><h2 class="truncate text-[22px] font-bold leading-tight tracking-tight">${name}</h2>${count ? `<span class="font-mono text-[12px] text-muted-foreground">${count}</span>` : ''}${badge}</div><div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">${meta}</div></div>`;

const NextStep = (eyebrow, title, body, cta, { icon = 'arrow-right', cls = 'mt-4' } = {}) =>
  Card(`<div class="p-4"><div class="text-[11px] font-semibold uppercase tracking-wider text-primary">${eyebrow}</div><div class="mt-1.5 text-[16px] font-semibold leading-snug">${title}</div><div class="mt-1 text-[13px] leading-relaxed text-muted-foreground">${body}</div>${cta ? Button(cta, { s: 'lg', cls: 'mt-3.5 w-full', iconRight: icon }) : ''}</div>`, cls);

const planRows = [
  { t: 'Confirm the release date', due: 'Start here', hot: true },
  { t: 'Choose distributor', due: 'Today' },
  { t: 'Brief designer on cover art', due: 'In 7 days' },
  { t: 'Set genre and language', due: 'In 7 days' },
  { t: 'Upload track to distributor', due: 'In 14 days' },
];
const TaskRow = ({ t, due, hot }, i) =>
  `<div class="flex items-center gap-3 py-2.5 ${i ? 'border-t border-border' : ''}">${Checkbox(false)}<div class="min-w-0 flex-1 truncate text-[14.5px] ${hot ? 'font-medium' : ''}">${t}</div><span class="shrink-0 font-mono text-[12px] ${hot ? 'text-primary' : 'text-muted-foreground'}">${due}</span></div>`;
const Phase = (rows = planRows, cls = 'mt-3') =>
  Card(`<div class="flex items-center justify-between px-4 pt-3.5"><div class="flex items-center gap-2 text-sm font-semibold">Pre-release ${Badge('Now', 'success')}</div><span class="font-mono text-[11.5px] text-muted-foreground">27 Nov to 25 Dec</span></div><div class="px-4 pb-1.5 pt-1">${rows.map(TaskRow).join('')}</div>`, cls);

const TrialLine = `<div class="mt-3 flex items-center gap-2 px-1 text-[12.5px] text-muted-foreground"><span class="h-1.5 w-1.5 rounded-full bg-primary"></span>Your 3-day trial is on.</div>`;
const Dock = `<div class="flex h-11 items-center gap-2 rounded-full border border-input bg-card pl-4 pr-1.5 text-[14px] text-muted-foreground shadow-sm">${ic('sparkles', 'size-4')}<span class="flex-1">Message Chappi...</span><span class="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground">${ic('arrow-up', 'size-4')}</span></div>`;

function Drawer(inner) {
  return `<div class="absolute inset-0 z-20 bg-black/40"></div>
  <div class="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[14px] border-t border-border bg-background px-4 pb-7">
    <div class="mx-auto mb-4 mt-3 h-1.5 w-12 rounded-full bg-muted"></div>${inner}</div>`;
}

const NavCard = (icon, title, desc) =>
  `<div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">${ic(icon, 'size-5')}</span>
    <div class="min-w-0 flex-1"><div class="text-[15px] font-semibold">${title}</div><div class="text-[13px] text-muted-foreground">${desc}</div></div>
    <span class="text-muted-foreground">${ic('chevron-right', 'size-4')}</span>
  </div>`;

const ItsMe = `<span class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-input px-2.5 text-[12.5px] font-medium shadow-sm">${ic('user', 'size-3')}It's me</span>`;
const DayHint = (t) => `<div class="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">${ic('calendar', 'size-3.5')}${t}</div>`;
const JoinLink = `<div class="mt-3 text-center text-[13px] text-muted-foreground">Joining a team? <span class="font-medium text-foreground underline underline-offset-4">I have an invite</span></div>`;

// ---------- board pieces ----------
const B = 'rounded-xl border border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-900';
const T1 = 'text-zinc-900 dark:text-zinc-50';
const T2 = 'text-zinc-600 dark:text-zinc-400';

const Screen = (n, title, why, phone) =>
  `<figure class="flex w-[375px] max-w-full flex-col gap-3"><figcaption class="min-h-[70px]"><div class="text-[13px] font-semibold ${T1}"><span class="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">${n}</span>${title}</div><div class="mt-1 text-[13px] leading-relaxed ${T2}">${why}</div></figcaption>${phone}</figure>`;

const ul = (items) => `<ul class="flex list-disc flex-col gap-1.5 pl-4">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
const Notes = (items) =>
  `<div class="mx-auto mt-10 grid max-w-[1189px] gap-3 sm:grid-cols-2 lg:grid-cols-4">${items.map(([t, body]) => `<div class="${B} p-4"><div class="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">${t}</div><div class="mt-2 text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">${body}</div></div>`).join('')}</div>`;

const Flow = (id, tag, title, desc, screens, notes, pick = false) =>
  `<section id="${id}" class="mx-auto mt-16 max-w-[1240px] px-1 py-6"><div class="mx-auto mb-8 max-w-[880px]"><div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">${tag}${pick ? '<span class="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] tracking-wide text-white">Recommended</span>' : ''}</div><h2 class="mt-1 text-[28px] font-semibold tracking-tight ${T1}">${title}</h2><p class="mt-1.5 max-w-[65ch] text-[15px] ${T2}">${desc}</p></div><div class="flex flex-wrap justify-center gap-x-8 gap-y-12">${screens.join('')}</div>${Notes(notes)}</section>`;

// ================= What we measured =================
const funnel = [
  [16, 'made an account', 100],
  [13, 'made a team', 81],
  [8, 'finished sign-up', 50],
  [3, 'made a rollout', 19],
  [0, 'made a rollout with a date, the only path that shows a full plan', 0],
];
const whys = [
  ['Email sign-up is turned away.', 'Type a name, an email and a password and the app says Urganize is invite-only. Only Google gets in. This is a bug and it is live now.'],
  ['Two screens of questions come before any plan.', '3 people stopped at the team screen. 5 more made a team, then stopped at the project screen or the plan wall.'],
  ['The answer picked for you gives an empty page.', '"No date yet" is selected when the form opens. It leads to a page that asks for "the idea" and shows no plan. All 3 rollouts made this month have no date.'],
  ['The price comes before the plan.', 'Five prices sit under the sign-in page, and a priced trial sheet covers the first screen inside the app.'],
  ['Nobody is asked to come back.', 'The 8 who stopped got no email asking them to finish. The welcome emails only start after sign-up is finished.'],
];
const todayShots = [
  ['03-email-sign-up-invite-only.png', 'Email and password', 'Turned away. Sign-up has been open since 8 Nov.'],
  ['04-set-up-your-team.png', 'Set up your team', '3 of 16 stopped here. A photo, a team name, who it is for.'],
  ['05-nothing-here-yet.png', '"Nothing here yet."', '5 of 16 stopped here, or at the plan wall that sat in front of it.'],
  ['08-no-date-empty-rollout.png', 'Add it with no date', 'The answer picked for you. An empty page that asks for \"the idea\". No plan.'],
  ['10-skip-two-gates.png', 'Skip for now', '"Profile setup required", with the price sheet over it.'],
];

// ================= Option A =================
const planLanding = (name, artist, initials) => Phone(`
    ${AppBar(initials)}
    ${RolloutTitle(name, '0/16', `<span>${artist} · drops Fri 22 Jan</span>`)}
    ${NextStep('Your plan is ready · 16 steps', 'Confirm the release date', 'Every other step is planned around it.', 'Confirm the date')}
    ${Phase()}
    ${TrialLine}`, { bottom: Dock });

const a = [
  Screen(1, 'One screen, about their song', 'Four answers, and three of them are one tap. A day is already picked, so the button always leads to a plan.', Phone(`
    ${SetupBar(Avatar('TB'))}
    ${H('What are you working on?', 'mt-3')}
    ${Muted('Name it and pick a day. Your plan is built around that day.', 'mt-1.5')}
    ${Field('Song or project', Input('Love Letters'), 'mt-5')}
    ${Field('Artist', Input('Kanmi Gold', { suffix: ItsMe }))}
    ${Field('Where is it now?', Seg(['Making it', 'Ready to drop', 'Already out'], 1))}
    ${Field('Release day', Seg(['4 weeks', '8 weeks', 'Pick a day', 'Not sure'], 1) + DayHint('Fri 22 Jan 2027, 8 weeks from today'))}
    ${Alert('You get 16 steps, from today to release week.', '', { icon: 'list-checks', v: 'success', cls: 'mt-4' })}`, {
    bottom: Button('Build my plan', { s: 'lg', cls: 'w-full' }) + JoinLink,
  })),
  Screen(2, 'The plan opens', 'No price sheet on top. The first step is waiting, and one quiet line says the trial is on.', planLanding('Love Letters', 'Kanmi Gold', 'TB')),
  Screen(3, 'If they tapped "Not sure"', 'We still build the plan, on a day 8 weeks out, and say plainly that the day is not confirmed.', Phone(`
    ${AppBar('TB')}
    ${RolloutTitle('Love Letters', '0/16', `<span>Kanmi Gold · around Fri 22 Jan</span>${Badge('Date not confirmed', 'warn')}`)}
    ${NextStep('One thing first', 'Pick your real release day', 'We put it 8 weeks from today. Change the day and every step moves with it.', 'Pick the day', { icon: 'calendar' })}
    ${Phase(planRows.slice(0, 4))}
    ${TrialLine}`, { bottom: Dock })),
];
const aNotes = [
  ['What changes', ul([
    'The team screen goes. The team is made as "Tunde\'s Team" and can be renamed in Team.',
    'Five stages become three. "Making it" still saves a project and opens the project page, as it does today.',
    '"It\'s me" tells us they are the artist. Anyone else is treated as a manager.',
    '"Not sure" puts the release 8 weeks out, so nobody lands on an empty page. This is a new rule and needs your yes.',
  ])],
  ['Why it should work', 'Phone visits are short. Most first visits here were under 5 minutes. One screen about their own song is easier to finish than two screens about setting up. They see the plan while they still care, and the price comes after they have seen something worth paying for. This is a prediction. We have no click data.'],
  ['What it costs', 'Medium. Most of the work is the sign-up page and its loading screen. Teams, rollouts and plans are made the same way they are today.'],
  ['How we will know', 'New accounts that have a rollout with a date within 10 minutes of signing up. Today that is 0 of 16.'],
];

// ================= Option B =================
const bExample = `
    ${AppBar('TB')}
    ${RolloutTitle('Love Letters from Yaba', '', '<span>Kanmi Gold · drops Fri 22 Jan</span>', Badge('Example', 'outline'))}
    ${NextStep('This is an example plan', 'Put your own song on it', 'The steps stay. The dates move to your release day.', 'Use my song')}
    ${Phase(planRows.slice(0, 4))}
    ${TrialLine}`;
const b = [
  Screen(1, 'The app opens on an example', 'No questions after the account. They see what a plan looks like before we ask for anything.', Phone(bExample, { bottom: Dock })),
  Screen(2, '"Use my song"', 'Three answers in a sheet, over the plan they were just looking at.', Phone(bExample, {
    bottom: Dock,
    overlay: Drawer(`
      <div class="text-[19px] font-bold tracking-tight">Your song</div>
      ${Field('Song or project', Input('', { placeholder: 'A working title is fine' }))}
      ${Field('Artist', Input('', { placeholder: 'Artist name', suffix: ItsMe }))}
      ${Field('Release day', Seg(['4 weeks', '8 weeks', 'Pick a day'], 1) + DayHint('Fri 22 Jan 2027, 8 weeks from today'))}
      ${Button('Build my plan', { s: 'lg', cls: 'mt-5 w-full' })}`),
  })),
  Screen(3, 'Their own plan', 'The same steps with their song and their dates. The example is removed.', Phone(`
    ${AppBar('TB')}
    ${RolloutTitle('Harmattan', '0/16', '<span>Amaka · drops Fri 22 Jan</span>')}
    ${Alert('This is your plan now. The example is gone.', '', { icon: 'circle-check', v: 'success', cls: 'mt-4' })}
    ${NextStep('Next step', 'Confirm the release date', 'Every other step is planned around it.', 'Confirm the date', { cls: 'mt-3' })}
    ${Phase(planRows.slice(0, 4))}`, { bottom: Dock })),
];
const bNotes = [
  ['What changes', ul([
    'The team screen and the project screen both go.',
    'Every new account starts with an example rollout, marked as a test so it stays out of our numbers.',
    '"Use my song" turns the example into their real rollout.',
  ])],
  ['Why it could work', 'They see the product before they type anything. A new person who is not sure what Urganize does gets the answer on the first screen.'],
  ['The risk', 'Some will look at the example, feel they have seen it, and leave without adding their own song. We would still have no real rollout from them, and it gets harder to tell who was serious.'],
  ['What it costs', 'The most work. Turning an example into a real rollout is new, and every number we keep has to leave examples out.'],
];

// ================= Option C =================
const c = [
  Screen(1, 'Team, in one tap', 'No photo and no name box. The team name is written for them.', Phone(`
    ${SetupBar(StepDots(1, 2))}
    ${H('Who is this for?', 'mt-3')}
    ${Muted('Tap one. Your team is called Tunde\'s Team. You can rename it later.', 'mt-1.5')}
    <div class="mt-5 flex flex-col gap-2.5">
      ${NavCard('user', 'Just me', 'I\'m the artist')}
      ${NavCard('users', 'Artists I manage', 'One artist or a few')}
      ${NavCard('building-2', 'A label', 'A roster and a team')}
    </div>`, { bottom: JoinLink })),
  Screen(2, 'The project screen, shorter', 'The heading is a question, there are three stages, and a day is already picked.', Phone(`
    ${SetupBar(StepDots(2, 2))}
    ${H('What are you working on?', 'mt-3')}
    ${Muted('Add it to Tunde\'s Team.', 'mt-1.5')}
    ${Field('Where is it now?', Seg(['Making it', 'Ready to drop', 'Already out'], 1), 'mt-5')}
    ${Field('Artist', Input('Kanmi Gold'))}
    ${Field('Name', Input('Love Letters'))}
    ${Field('Release day', Seg(['8 weeks', 'Pick a day', 'No date yet'], 0) + DayHint('Fri 22 Jan 2027, 8 weeks from today'))}`, {
    bottom: Button('Build my plan', { s: 'lg', cls: 'w-full' }) + `<div class="mt-3 text-center text-[13px] font-medium underline underline-offset-4">Skip for now</div>`,
  })),
  Screen(3, 'The plan opens', 'The same landing as option A: the plan, the first step, no price sheet on top.', planLanding('Love Letters', 'Kanmi Gold', 'TB')),
];
const cNotes = [
  ['What changes', ul([
    'Team: three cards, one tap.',
    'Project: the example card and the two extra cards (bring in released music, invite your team) move to Home.',
    '"No date yet" and "Skip for now" stay for people who want them.',
  ])],
  ['Why it could work', 'It is the smallest change to a flow people already pass through, and each screen is quicker to finish.'],
  ['The risk', 'There are still two screens between the account and the plan. 8 of the 16 left across those two screens.'],
  ['What it costs', 'The least work.'],
];

// ================= In every option =================
const everyFix = [
  ['Email sign-up works', 'Today a name, an email and a password gets "Urganize is invite-only for now". The check that runs before the account is made does not know sign-up is open. Google skips that check, so every sign-up without an invite since 8 Nov came through Google.', true],
  ['The sign-up link opens "Create your account"', 'Today the sign-in page shows first for a moment, with five prices under it.'],
  ['No "Profile setup required" stop', 'The artist name comes from the first screen, so an artist is not stopped and asked again.'],
  ['The priced trial sheet does not cover the first screen', 'One line says the trial is on. When the plans show again is your call, for example on the second visit or the day before the trial ends.'],
  ['Loading screens match', 'Every screen that changes gets its loading skeleton updated in the same PR.'],
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
/* Tokens: the app's palette (apps/web/app/globals.css), as shadcn names. */
:root, [data-theme="light"] {
  --background: 245 240 230; --foreground: 26 22 17;
  --card: 250 245 236; --card-foreground: 26 22 17;
  --primary: 20 100 58; --primary-foreground: 245 240 230;
  --secondary: 235 230 220; --secondary-foreground: 26 22 17;
  --muted: 235 230 220; --muted-foreground: 75 71 64;
  --accent: 235 230 220; --accent-foreground: 26 22 17;
  --border: 225 220 211; --input: 127 122 115; --ring: 20 100 58;
  --warn: 126 72 10; --destructive: 150 26 26;
}
[data-theme="dark"] {
  --background: 12 16 13; --foreground: 245 240 230;
  --card: 24 29 25; --card-foreground: 245 240 230;
  --primary: 127 217 154; --primary-foreground: 12 16 13;
  --secondary: 28 33 29; --secondary-foreground: 245 240 230;
  --muted: 28 33 29; --muted-foreground: 161 160 152;
  --accent: 28 33 29; --accent-foreground: 245 240 230;
  --border: 36 43 37; --input: 96 100 94; --ring: 127 217 154;
  --warn: 240 185 92; --destructive: 250 138 138;
}
@tailwind base; @tailwind components; @tailwind utilities;
body { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
</style>
</head>
<body class="min-h-screen bg-zinc-200 px-4 pb-24 pt-10 dark:bg-zinc-950">
  <header class="mx-auto max-w-[1000px]">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mock options · 27 Nov 2026 · issue #1412</div>
      <div class="inline-flex h-9 items-center rounded-lg bg-zinc-300/70 p-1 text-sm dark:bg-zinc-800">
        <button data-set="light" class="theme-btn rounded-md px-3 py-1 font-medium">Light</button>
        <button data-set="dark" class="theme-btn rounded-md px-3 py-1 font-medium">Dark</button>
      </div>
    </div>
    <h1 class="mt-4 max-w-[22ch] text-[36px] font-semibold leading-tight tracking-tight ${T1}">A new person should see their plan in the first minute</h1>
    <p class="mt-3 max-w-[68ch] text-[16px] leading-relaxed ${T2}">People make an account and leave before they add any music. Below is what we measured, what a new person meets today, and three ways to fix it. The screens are drawn for a phone, because 13 of the 16 real accounts since 3 Nov signed up on one. Nothing here is built. Names and dates on the new screens are made up.</p>

    <div id="measured" class="mt-8 grid gap-3 py-2 md:grid-cols-[1fr_1.15fr]">
      <div class="${B} p-5">
        <div class="text-[17px] font-semibold ${T1}">16 real accounts since 3 Nov</div>
        <div class="mt-0.5 text-[13px] ${T2}">3 test accounts left out. Read from production on 26 and 27 Nov, read-only.</div>
        <div class="mt-5 flex flex-col gap-3.5">
          ${funnel.map(([n, label, pct]) => `<div class="grid grid-cols-[30px_1fr] items-start gap-3"><div class="pt-0.5 text-right font-mono text-[20px] font-medium leading-none ${n === 0 ? 'text-red-700 dark:text-red-400' : T1}">${n}</div><div><div class="text-[13.5px] leading-snug ${n === 0 ? 'font-semibold text-red-700 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'}">${label}</div><div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"><div class="h-full rounded-full bg-emerald-700 dark:bg-emerald-500" style="width:${pct}%"></div></div></div></div>`).join('')}
        </div>
        <div class="mt-5 border-t border-zinc-200 pt-3 text-[13px] leading-relaxed dark:border-zinc-800 ${T2}">15 of the 16 opened the app on one day and did not come back. 13 of the 16 were on a phone.</div>
      </div>
      <div class="${B} p-5">
        <div class="text-[17px] font-semibold ${T1}">Why nobody adds music</div>
        <ol class="mt-4 flex flex-col gap-3.5">
          ${whys.map(([t, d], i) => `<li class="flex gap-3"><span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">${i + 1}</span><div class="text-[13.5px] leading-relaxed ${T2}"><b class="${T1}">${t}</b> ${d}</div></li>`).join('')}
        </ol>
        <div class="mt-4 rounded-lg bg-zinc-100 p-3 text-[13px] leading-relaxed dark:bg-zinc-800/60 ${T2}"><b class="${T1}">The plan wall.</b> From 31 Oct to 13 Nov a new team had to pay before its first project, and 3 of the 16 met that wall in their first minutes. Since 13 Nov there is a 3-day trial, so the wall is not what stops people now.</div>
      </div>
    </div>
  </header>

  <section id="today" class="mx-auto mt-14 max-w-[1240px] px-1 py-6">
    <div class="mx-auto max-w-[1000px]"><div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Today</div><h2 class="mt-1 text-[28px] font-semibold tracking-tight ${T1}">What a new person meets on a phone</h2><p class="mt-1.5 max-w-[65ch] text-[15px] ${T2}">Real screens from the local test app, 27 Nov, in the app's dark theme.</p></div>
    <div class="mx-auto mt-6 grid max-w-[1189px] grid-cols-2 gap-4 md:grid-cols-5">
      ${todayShots.map(([f, t, d], i) => `<figure><div class="overflow-hidden rounded-2xl border-[5px] border-zinc-900 bg-black shadow-lg"><img src="screens/${f}" alt="${t.replace(/"/g, '')}" class="block h-[330px] w-full object-cover object-top"></div><figcaption class="mt-2.5"><div class="text-[13px] font-semibold ${T1}"><span class="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">${i + 1}</span>${t}</div><div class="mt-1 text-[13px] leading-relaxed ${T2}">${d}</div></figcaption></figure>`).join('')}
    </div>
  </section>

  ${Flow('opt-a', 'Option A', 'One screen about their song, then the plan', 'After the account there is one screen. It asks about the song, makes the team quietly and opens a full plan. The team screen and "Nothing here yet." both go.', a, aNotes, true)}
  ${Flow('opt-b', 'Option B', 'Straight in, with an example plan', 'No questions after the account. The app opens on a ready example, and one tap puts their own song on it.', b, bNotes)}
  ${Flow('opt-c', 'Option C', 'Keep the two setup screens, make each one shorter', 'The flow you approved on 29 Oct stays. Each screen gets shorter, and the answer picked for you leads to a plan.', c, cNotes)}

  <section id="every" class="mx-auto mt-16 max-w-[1000px] py-6">
    <div class="grid gap-3 md:grid-cols-[1.2fr_1fr]">
      <div class="${B} p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Not a choice</div>
        <h2 class="mt-1 text-[22px] font-semibold tracking-tight ${T1}">In every option</h2>
        <ol class="mt-4 flex flex-col gap-3.5">
          ${everyFix.map(([t, d, bug], i) => `<li class="flex gap-3"><span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-700 text-[11px] font-semibold text-white">${i + 1}</span><div class="text-[13.5px] leading-relaxed ${T2}"><div class="flex flex-wrap items-center gap-2"><b class="text-[14.5px] ${T1}">${t}</b>${bug ? '<span class="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800 dark:bg-red-950 dark:text-red-300">Bug, live now</span>' : ''}</div>${d}</div></li>`).join('')}
        </ol>
      </div>
      <div class="${B} p-5">
        <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Add-on, your call</div>
        <h2 class="mt-1 text-[22px] font-semibold tracking-tight ${T1}">One email the next morning</h2>
        <p class="mt-1.5 text-[13.5px] leading-relaxed ${T2}">For anyone who made an account and stopped before adding music. It works with A, B or C.</p>
        <div class="mt-4 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow">
          <div class="flex items-center gap-3 border-b border-border p-3.5">${Avatar('O', 'bg-primary text-primary-foreground', 'h-9 w-9 text-[13px]')}<div class="min-w-0"><div class="text-[12.5px] text-muted-foreground">Oyin, Urganize</div><div class="truncate text-[15px] font-semibold">You stopped before adding your song</div></div></div>
          <div class="p-4 text-[14px] leading-relaxed text-foreground">
            <p>Hi Tunde,</p>
            <p class="mt-2.5">You made your Urganize account yesterday and stopped before adding your music.</p>
            <p class="mt-2.5">Give it a song name and a release day. The plan is made as soon as you do.</p>
            ${Button('Add my song', { cls: 'mt-4', iconRight: 'arrow-right' })}
            <p class="mt-4">Oyin</p>
          </div>
        </div>
        <p class="mt-3 text-[12.5px] leading-relaxed ${T2}">The words are a first guess. Other subject lines: "Your plan needs one thing from you" and "One song name and your plan is made". Nothing is sent until you approve the words.</p>
      </div>
    </div>

    <h2 class="mt-12 text-[22px] font-semibold tracking-tight ${T1}">What I need from you</h2>
    <div class="mt-3 ${B} p-4 text-[14.5px] leading-relaxed ${T2}"><b class="${T1}">One decision now: A, B or C.</b> I recommend A. After your pick I will ask about the "Not sure" rule, the next-morning email and when the priced sheet shows again, one at a time.</div>

    <h2 class="mt-10 text-[22px] font-semibold tracking-tight ${T1}">Measured vs assumed</h2>
    <ul class="mt-3 flex flex-col gap-2 text-[14.5px] leading-relaxed ${T2}">
      <li><b class="${T1}">Measured:</b> the account numbers and the phone split (production, read-only), the email sign-up block (checked on production, 27 Nov), and every "today" screen (local test app, 27 Nov).</li>
      <li><b class="${T1}">Assumed:</b> that people leave because of these screens and not for a reason we cannot see, and that a faster plan brings them back. There is no click data for the sign-up screens.</li>
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
  theme: { extend: {
    fontFamily: { mono: ['"DM Mono"', 'ui-monospace', 'monospace'] },
    colors: Object.fromEntries(['background','foreground','card','card-foreground','primary','primary-foreground','secondary','secondary-foreground','muted','muted-foreground','accent','accent-foreground','border','input','ring','warn','destructive'].map(k => [k, 'rgb(var(--' + k + ') / <alpha-value>)'])),
  } },
};`;
fs.writeFileSync(path.join(WORK, 'tailwind.config.js'), cfg);
fs.writeFileSync(path.join(WORK, 'in.css'), html.match(/<style>([\s\S]*?)<\/style>/)[1]);
execFileSync(process.execPath, [path.join(TOOLS, 'node_modules/tailwindcss/lib/cli.js'), '-c', 'tailwind.config.js', '-i', 'in.css', '-o', 'out.css', '--minify'], { cwd: WORK, stdio: 'pipe' });
const css = fs.readFileSync(path.join(WORK, 'out.css'), 'utf8');
fs.writeFileSync(OUT, html.replace(/<style>[\s\S]*?<\/style>/, () => `<style>${css}</style>`));
if (missing.size) console.log('MISSING ICONS:', [...missing].join(', '));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
