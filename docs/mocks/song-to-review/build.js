// Builds docs/mocks/song-to-review/mock.html from shadcn/ui (new-york) class strings,
// the app's tokens, lucide icons, and Tailwind compiled inline.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Setup once in this folder: npm i --no-save tailwindcss@3.4.17 lucide-static@0.460.0, then: node build.js
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
    <div class="flex h-11 shrink-0 items-center justify-between px-7 pt-1 text-[13px] font-semibold"><span>9:41</span><span class="flex items-center gap-1.5">${ic('signal', 'size-3.5')}${ic('wifi', 'size-3.5')}${ic('battery-full', 'size-4')}</span></div>
    <div class="relative flex-1 overflow-hidden px-4 pb-4">${content}<div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"></div></div>
    ${bottom ? `<div class="shrink-0 border-t border-border bg-background/95 px-4 pb-6 pt-3 backdrop-blur">${bottom}</div>` : ''}
    ${overlay}
  </div>`;
}

const TopBar = (back, right = '') =>
  `<div class="flex h-11 items-center justify-between"><button class="${btnBase} ${btnV.ghost} h-10 -ml-2 px-2 text-muted-foreground">${ic('chevron-left')}${back}</button><div class="flex items-center gap-1">${right}</div></div>`;

const IconBtn = (name) => `<button class="${btnBase} ${btnV.ghost} h-10 w-10 text-muted-foreground">${ic(name)}</button>`;

const Cover = (seed, size = 'h-14 w-14', text = '') => {
  const g = {
    rain: 'from-sky-700 via-indigo-800 to-zinc-900',
    gbese: 'from-amber-600 via-rose-700 to-zinc-900',
    new: 'from-zinc-600 via-zinc-700 to-zinc-800',
    sun: 'from-orange-400 via-amber-600 to-rose-800',
  }[seed];
  return `<div class="relative ${size} shrink-0 overflow-hidden rounded-lg bg-gradient-to-br ${g} shadow-inner">${text ? `<span class="absolute inset-0 grid place-items-center text-white/80">${text}</span>` : ''}</div>`;
};

const Title = (cover, name, meta, badge = '') =>
  `<div class="mt-1 flex items-center gap-3.5">${cover}<div class="min-w-0 flex-1"><div class="flex items-center gap-2"><h2 class="truncate font-display text-[26px] leading-tight">${name}</h2></div><div class="mt-0.5 flex items-center gap-2 text-[13px] text-muted-foreground">${meta}${badge}</div></div></div>`;

// Stage stepper: a track with three nodes.
function Stepper(active, subs) {
  const names = ['Song', 'Release', 'Out'];
  const node = (i) => {
    const done = i < active, on = i === active;
    const dot = done
      ? `<span class="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">${ic('check', 'size-3.5')}</span>`
      : on
        ? `<span class="grid h-6 w-6 place-items-center rounded-full border-2 border-primary bg-background"><span class="h-2 w-2 rounded-full bg-primary"></span></span>`
        : `<span class="h-6 w-6 rounded-full border-2 border-input bg-background"></span>`;
    return `<div class="relative z-10 flex flex-col items-center gap-1.5">${dot}<div class="text-center leading-tight"><div class="text-[13px] font-semibold ${on ? 'text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'}">${names[i]}</div><div class="text-[11px] ${on ? 'text-primary' : 'text-muted-foreground'}">${subs[i]}</div></div></div>`;
  };
  const fill = active === 0 ? 0 : active === 1 ? 50 : 100;
  return `<div class="relative mt-5 flex justify-between px-3">
    <div class="absolute left-[34px] right-[34px] top-3 h-0.5 rounded bg-border"><div class="h-full rounded bg-primary" style="width:${fill}%"></div></div>
    ${node(0)}${node(1)}${node(2)}
  </div>`;
}

const TaskRow = ({ t, sub, who, done, date, first }) =>
  `<div class="flex items-center gap-3 py-2.5 ${first ? '' : 'border-t border-border'}">
    ${date || Checkbox(done)}
    <div class="min-w-0 flex-1"><div class="truncate text-[15px] ${done ? 'text-muted-foreground line-through decoration-muted-foreground/50' : ''}">${t}</div>${sub ? `<div class="truncate text-[12.5px] text-muted-foreground">${sub}</div>` : ''}</div>
    ${who ? Avatar(who) : ''}
  </div>`;

function Group(name, done, total, rows, { open = true } = {}) {
  const complete = done === total;
  return `<div class="border-t border-border first:border-t-0">
    <div class="flex items-center justify-between py-3">
      <div class="flex items-center gap-2 text-sm font-semibold">${complete ? `<span class="text-primary">${ic('circle-check', 'size-4')}</span>` : ''}${name}</div>
      <div class="flex items-center gap-2 text-[13px] text-muted-foreground"><span class="tabular-nums">${done}/${total}</span>${ic(open ? 'chevron-up' : 'chevron-down', 'size-4')}</div>
    </div>
    ${open ? `<div class="pb-2">${rows.map((r, i) => TaskRow({ ...r, first: i === 0 })).join('')}</div>` : ''}
  </div>`;
}

const DatePill = (d, m, tone = '') =>
  `<span class="flex w-10 shrink-0 flex-col items-center rounded-md py-1 ${tone === 'warn' ? 'bg-warn/15 text-warn' : tone === 'today' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}"><span class="text-[15px] font-semibold leading-none tabular-nums">${d}</span><span class="mt-0.5 text-[10px] font-medium uppercase tracking-wide ${tone ? '' : 'text-muted-foreground'}">${m}</span></span>`;

function Drawer(inner) {
  return `<div class="absolute inset-0 z-20 bg-black/50"></div>
  <div class="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[14px] border-t border-border bg-background px-4 pb-7">
    <div class="mx-auto mb-4 mt-3 h-1.5 w-12 rounded-full bg-muted"></div>${inner}</div>`;
}

const Kpi = (icon, value, label, cap = '') =>
  `<div class="rounded-xl border border-border bg-card p-3.5 shadow"><div class="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">${ic(icon, 'size-3.5')}${label}</div><div class="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">${value}</div>${cap ? `<div class="mt-1.5 text-[12px] text-muted-foreground">${cap}</div>` : ''}</div>`;

const BarRow = (label, pct, dot) =>
  `<div class="flex items-center gap-3 py-1.5 text-sm"><span class="flex w-[104px] items-center gap-2"><span class="h-2 w-2 rounded-full ${dot}"></span>${label}</span><div class="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style="width:${pct}%"></div></div><span class="w-9 text-right text-[12.5px] tabular-nums text-muted-foreground">${pct}%</span></div>`;

const Source = (t) => `<div class="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">${ic('info', 'size-3')}${t}</div>`;

const H = (t, cls = '') => `<h2 class="font-display text-[26px] leading-tight ${cls}">${t}</h2>`;
const Muted = (t, cls = '') => `<p class="text-[14px] leading-relaxed text-muted-foreground ${cls}">${t}</p>`;

const StepDots = (n, of) =>
  `<div class="flex items-center gap-1.5">${Array.from({ length: of }, (_, i) => `<span class="h-1.5 rounded-full ${i < n ? 'w-6 bg-primary' : 'w-1.5 bg-input'}"></span>`).join('')}</div>`;

const OptionCard = (icon, title, desc, on) =>
  `<div class="flex items-center gap-3 rounded-xl border p-3.5 ${on ? 'border-primary bg-primary/[.07] ring-1 ring-primary' : 'border-border bg-card shadow-sm'}">
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">${ic(icon, 'size-5')}</span>
    <div class="min-w-0 flex-1"><div class="text-[15px] font-semibold">${title}</div>${desc ? `<div class="text-[13px] text-muted-foreground">${desc}</div>` : ''}</div>
    <span class="grid h-[18px] w-[18px] place-items-center rounded-full border ${on ? 'border-primary' : 'border-input'}">${on ? '<span class="h-2.5 w-2.5 rounded-full bg-primary"></span>' : ''}</span>
  </div>`;

const Screen = (n, title, why, phone) =>
  `<figure class="flex w-[375px] max-w-full flex-col gap-3"><figcaption class="min-h-[64px]"><div class="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100"><span class="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">${n}</span>${title}</div><div class="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">${why}</div></figcaption>${phone}</figure>`;

const Flow = (tag, title, desc, screens) =>
  `<section class="mx-auto mt-20 max-w-[1240px]"><div class="mx-auto mb-8 max-w-[880px]"><div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">${tag}</div><h2 class="mt-1 text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">${title}</h2><p class="mt-1.5 max-w-[65ch] text-[15px] text-zinc-600 dark:text-zinc-400">${desc}</p></div><div class="flex flex-wrap justify-center gap-x-8 gap-y-12">${screens.join('')}</div></section>`;

// ================= FLOW 1 =================
const songRowsIdea = [
  { t: 'Write the hook', who: 'AB', done: true },
  { t: 'Record a voice note demo', who: 'AB', done: true },
  { t: 'Pick the producer', who: 'KO' },
];

const f1 = [
  Screen(1, 'Start a song', 'From the artist page or the + button anywhere. A name and where it’s at. Nothing else.', Phone(`
    ${TopBar('Artists', IconBtn('ellipsis'))}
    <div class="mt-1 flex items-center gap-3.5"><span class="grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-lg font-semibold text-amber-700 dark:text-amber-300">AB</span><div>${H('Ayo Banks')}<div class="text-[13px] text-muted-foreground">2 releases · last one 6 weeks ago</div></div></div>
    <div class="mt-5">${Card(`<div class="flex flex-col items-center px-6 py-6 text-center"><span class="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">${ic('music', 'size-5')}</span><div class="mt-3 font-semibold">Nothing in the works</div><div class="mt-1 text-[13px] text-muted-foreground">Start the next song and you get the checklist.</div></div>`)}</div>
    <div class="mt-5 text-sm font-semibold">Out</div>
    <div class="mt-2">${Card(`<div class="px-4">${[['sun', 'Sunday Light', 'Single · 25 Sep', Badge('Review ready', 'success')], ['rain', 'Okada', 'Single · 12 Jun', '']].map(([c, t, s, b], i) => `<div class="flex items-center gap-3 py-3 ${i ? 'border-t border-border' : ''}">${Cover(c, 'h-10 w-10')}<div class="flex-1"><div class="text-[15px] font-medium">${t}</div><div class="text-[12.5px] text-muted-foreground">${s}</div></div>${b}</div>`).join('')}</div>`)}</div>`, {
    overlay: Drawer(`
      <div class="text-lg font-semibold tracking-tight">Start a song</div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">For Ayo Banks</div>
      ${Label('Song name', 'mt-5 mb-2')}${Input('Lagos Rain', { cls: 'ring-1 ring-ring border-ring' })}
      <div class="mt-1.5 text-[12.5px] text-muted-foreground">A working title is fine.</div>
      ${Label('Where is it at?', 'mt-5 mb-2')}${ToggleGroup(['Just an idea', 'Recording', 'Mixing', 'Finished'], 0)}
      ${Button('Start the song', { s: 'lg', cls: 'mt-6 w-full' })}`),
  })),

  Screen(2, 'The checklist is already there', 'Every step of making a song, in order, with no dates. Groups fold away when done. Tap a task to give it to someone.', Phone(`
    ${TopBar('Ayo Banks', IconBtn('user-plus') + IconBtn('ellipsis'))}
    ${Title(Cover('rain', 'h-14 w-14', ic('music', 'size-5')), 'Lagos Rain', 'Single · started today')}
    ${Stepper(0, ['2 of 15', 'No day yet', ''])}
    <div class="mt-5">${Card(`<div class="px-4 pt-3.5"><div class="flex items-center justify-between text-sm"><span class="font-semibold">Making the song</span><span class="tabular-nums text-muted-foreground">2 of 15</span></div>${Progress(13, 'mt-2.5')}</div>
      <div class="mt-1 px-4">
        ${Group('Idea', 2, 3, songRowsIdea)}
        ${Group('Recording', 0, 4, [{ t: 'Book the studio session', who: 'KO' }, { t: 'Record vocals', who: 'AB' }, { t: 'Feature agreed and signed', sub: 'Skip if there’s no feature', who: 'KO' }])}
        ${Group('Finishing', 0, 4, [], { open: false })}
        ${Group('Paperwork', 0, 4, [], { open: false })}
      </div>`)}</div>`, {
    bottom: `<div class="flex gap-2">${Button('', { v: 'outline', s: 'icon', icon: 'sparkles', cls: 'h-11 w-11' })}${Button('Release this song', { s: 'lg', cls: 'flex-1', iconRight: 'arrow-right' })}</div><div class="mt-2 text-center text-[12px] text-muted-foreground">Ready when you are. You don’t need every box ticked.</div>`,
  })),

  Screen(3, 'Release this song', 'Pick a day. What’s still open on the song moves into the plan with a date, so nothing gets lost.', Phone(`
    ${TopBar('Ayo Banks')}
    ${Title(Cover('rain', 'h-14 w-14', ic('music', 'size-5')), 'Lagos Rain', 'Single')}
    ${Stepper(0, ['12 of 15', 'No day yet', ''])}`, {
    overlay: Drawer(`
      <div class="text-lg font-semibold tracking-tight">Release Lagos Rain</div>
      <div class="mt-0.5 text-[13px] text-muted-foreground">We build the plan back from this day.</div>
      ${Label('Release day', 'mt-5 mb-2')}
      <div class="grid grid-cols-3 gap-2">${[['Fri', '15 Jan', '9 wks'], ['Fri', '22 Jan', '10 wks'], ['Fri', '29 Jan', '11 wks']].map(([d, dt, w], i) => `<div class="rounded-lg border p-2.5 text-center ${i === 1 ? 'border-primary bg-primary/[.07] ring-1 ring-primary' : 'border-input'}"><div class="text-[11px] text-muted-foreground">${d}</div><div class="text-[15px] font-semibold">${dt}</div><div class="text-[11px] ${i === 1 ? 'text-primary' : 'text-muted-foreground'}">${w}</div></div>`).join('')}</div>
      <button class="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-primary">${ic('calendar', 'size-3.5')}Pick another day</button>
      ${Label('Promo budget', 'mt-5 mb-2')}${Input('150,000', { suffix: '<span class="text-muted-foreground">₦</span>' })}
      <div class="mt-4">${Alert('3 song tasks move into the plan', 'Master, split sheet and credits get dates in the first week.', { icon: 'list-checks', v: 'success' })}</div>
      ${Button('Make the plan', { s: 'lg', cls: 'mt-5 w-full', icon: 'sparkles' })}`),
  })),

  Screen(4, 'Same page, now a release', 'The song is done and folded. The plan is dated and this week sits on top. Late work turns amber.', Phone(`
    ${TopBar('Ayo Banks', IconBtn('user-plus') + IconBtn('ellipsis'))}
    ${Title(Cover('rain', 'h-14 w-14', ic('music', 'size-5')), 'Lagos Rain', 'Out Fri 22 Jan', Badge('10 wks', 'outline'))}
    ${Stepper(1, ['Done', '0 of 48', '22 Jan'])}
    <div class="mt-5">${Card(`${CardHeader('This week', '4 tasks · 2 from the song', Badge('1 late', 'warn', 'clock'))}<div class="px-4 pb-2">
      ${TaskRow({ t: 'Master approved', sub: 'From the song · was due Mon', who: 'AB', date: DatePill('9', 'Nov', 'warn'), first: true })}
      ${TaskRow({ t: 'Split sheet signed', sub: 'From the song', who: 'KO', date: DatePill('11', 'Nov', 'today') })}
      ${TaskRow({ t: 'Brief the cover designer', who: 'KO', date: DatePill('13', 'Nov') })}
      ${TaskRow({ t: 'Set the distributor date', who: 'KO', date: DatePill('13', 'Nov') })}
    </div>`)}</div>
    <div class="mt-3">${Card(`<div class="px-4 py-1">${[['Before release', 'Cover, metadata, pitching, content', 0, 38], ['Release week', 'Smart link, posts, radio', 0, 6], ['After release', 'Opens on 22 Jan', 0, 7]].map(([t, s, d, n], i) => `<div class="flex items-center gap-3 py-3 ${i ? 'border-t border-border' : ''}"><div class="min-w-0 flex-1"><div class="text-[15px] font-medium">${t}</div><div class="truncate text-[12.5px] text-muted-foreground">${s}</div></div><span class="text-[13px] tabular-nums text-muted-foreground">${d}/${n}</span>${ic('chevron-right', 'size-4 text-muted-foreground')}</div>`).join('')}</div>`)}</div>`)),

  Screen(5, 'It’s out', 'On release day the after-release tasks open, the smart link is one tap away, and the page says when the review comes.', Phone(`
    ${TopBar('Ayo Banks', IconBtn('ellipsis'))}
    ${Title(Cover('rain', 'h-14 w-14', ic('music', 'size-5')), 'Lagos Rain', 'Out today', Badge('Live', 'success', 'radio'))}
    ${Stepper(2, ['Done', '44 of 48', 'Day 1'])}
    <div class="mt-5">${Card(`<div class="p-4"><div class="text-sm font-semibold">Smart link</div><div class="mt-2 flex gap-2">${Input('urg.link/lagos-rain', { icon: 'link', cls: 'h-9 flex-1 text-sm' })}${Button('Copy', { v: 'outline', icon: 'copy' })}</div></div>`)}</div>
    <div class="mt-3">${Card(`${CardHeader('After release', '7 tasks over 4 weeks', '<span class="text-[13px] tabular-nums text-muted-foreground">0/7</span>')}<div class="px-4 pb-2">
      ${TaskRow({ t: 'Share the smart link', who: 'KO', date: DatePill('22', 'Jan', 'today'), first: true })}
      ${TaskRow({ t: 'Post the release day video', who: 'AB', date: DatePill('22', 'Jan', 'today') })}
      ${TaskRow({ t: 'Thank curators who added it', who: 'KO', date: DatePill('24', 'Jan') })}
    </div>`)}</div>
    <div class="mt-3">${Alert('Your review comes Fri 29 Jan', 'Fans, your team and streams, in one page. We email it to you too.', { icon: 'chart-column' })}</div>`)),
];

// ================= FLOW 2 =================
const f2 = [
  Screen(1, 'Your account', 'Google or email. Nothing else on the screen.', Phone(`
    <div class="flex h-full flex-col pt-10">
      <div class="flex items-center gap-2"><span class="grid h-9 w-9 place-items-center rounded-lg bg-primary font-display text-lg text-primary-foreground">U</span><span class="text-lg font-semibold tracking-tight">Urganize</span></div>
      <h1 class="mt-12 font-display text-[34px] leading-[1.1]">From idea to execution.</h1>
      ${Muted('Make the song, plan the release, see how it did. One checklist the whole way.', 'mt-3')}
      <div class="mt-9 flex flex-col gap-2.5">
        ${Button('<span class="font-bold">G</span>&nbsp;Continue with Google', { v: 'outline', s: 'lg', cls: 'w-full' })}
        <div class="my-2 flex items-center gap-3 text-[12px] text-muted-foreground">${Separator('flex-1')}or${Separator('flex-1')}</div>
        ${Input('', { placeholder: 'Your name' })}${Input('', { placeholder: 'Email' })}${Input('', { placeholder: 'Password' })}
        ${Button('Create account', { s: 'lg', cls: 'mt-1 w-full' })}
      </div>
      <div class="mt-auto text-center text-[13px] text-muted-foreground">Have a referral code?</div>
    </div>`)),

  Screen(2, 'Who it’s for', 'One tap. It sets up the team and the words we use. A pending invite shows here as a Join card instead.', Phone(`
    <div class="flex items-center justify-between pt-3">${StepDots(1, 3)}<span class="text-[13px] text-muted-foreground">Skip</span></div>
    ${H('Hi Tolu. Who is Urganize for?', 'mt-8')}
    <div class="mt-6 flex flex-col gap-2.5">
      ${OptionCard('mic', 'Me, I’m the artist', 'I make the music and run my releases.', true)}
      ${OptionCard('user-round', 'An artist I manage', 'Or a few artists.')}
      ${OptionCard('building-2', 'My label', 'A roster of artists.')}
    </div>`, { bottom: Button('Continue', { s: 'lg', cls: 'w-full' }) })),

  Screen(3, 'Find the artist', 'We search the stores, so past releases come in too. No releases yet? Carry on with the name.', Phone(`
    <div class="flex items-center justify-between pt-3">${StepDots(2, 3)}<span class="text-[13px] text-muted-foreground">Skip</span></div>
    ${H('What’s your artist name?', 'mt-8')}
    <div class="mt-6">${Input('Tolu Vibes', { icon: 'search', cls: 'ring-1 ring-ring border-ring' })}</div>
    <div class="mt-3">${Card(`<div class="px-3">${[['TV', 'Tolu Vibes', '3 releases · latest Mar 2026', true], ['TV', 'Tolu V', '1 release · 2023', false]].map(([a, n, s, on], i) => `<div class="flex items-center gap-3 py-3 ${i ? 'border-t border-border' : ''}">${Cover(on ? 'gbese' : 'new', 'h-11 w-11 rounded-full')}<div class="flex-1"><div class="text-[15px] font-medium">${n}</div><div class="text-[12.5px] text-muted-foreground">${s}</div></div>${on ? `<span class="grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-primary-foreground">${ic('check', 'size-3')}</span>` : '<span class="h-[18px] w-[18px] rounded-full border border-input"></span>'}</div>`).join('')}</div>`)}</div>
    <div class="mt-3 text-[13px] text-muted-foreground">Not here? <span class="font-medium text-primary">Paste your Apple Music link</span></div>`, { bottom: Button('That’s me', { s: 'lg', cls: 'w-full' }) })),

  Screen(4, 'The first song', 'The same question as Start a song. Where it’s at decides what we tick for you.', Phone(`
    <div class="flex items-center justify-between pt-3">${StepDots(3, 3)}</div>
    ${H('What are you working on?', 'mt-8')}
    ${Label('Song name', 'mt-6 mb-2')}${Input('Gbese')}
    ${Label('Where is it at?', 'mt-5 mb-2')}
    <div class="flex flex-col gap-2">
      ${OptionCard('lightbulb', 'Just an idea', '')}
      ${OptionCard('mic', 'Recording', '')}
      ${OptionCard('sliders-horizontal', 'Mixing', 'Recorded, getting it right.', true)}
      ${OptionCard('disc-3', 'Finished', 'Pick a release day next.')}
      ${OptionCard('radio', 'Already out', 'Plan the after-release work.')}
    </div>`, { bottom: Button('Show me the checklist', { s: 'lg', cls: 'w-full', iconRight: 'arrow-right' }) })),

  Screen(5, 'In, and working', 'Idea and Recording are ticked already. One short tip, then the list. Invite the team when ready.', Phone(`
    ${TopBar('Tolu Vibes', IconBtn('user-plus') + IconBtn('ellipsis'))}
    ${Title(Cover('gbese', 'h-14 w-14', ic('music', 'size-5')), 'Gbese', 'Single · Tolu Vibes')}
    ${Stepper(0, ['7 of 15', 'No day yet', ''])}
    <div class="mt-5">${Alert('Here’s your checklist', 'We ticked what you’ve done. Tick the rest as you go.', { icon: 'sparkles', v: 'success' })}</div>
    <div class="mt-3">${Card(`<div class="px-4 pt-3.5"><div class="flex items-center justify-between text-sm"><span class="font-semibold">Making the song</span><span class="tabular-nums text-muted-foreground">7 of 15</span></div>${Progress(47, 'mt-2.5')}</div><div class="mt-1 px-4">
      ${Group('Idea', 3, 3, [], { open: false })}
      ${Group('Recording', 4, 4, [], { open: false })}
      ${Group('Finishing', 0, 4, [{ t: 'Send notes to the mix engineer', who: 'TV' }, { t: 'Mix approved', who: 'TV' }, { t: 'Master the song', who: 'TV' }])}
    </div>`)}</div>`, {
    bottom: `<div class="flex items-center gap-3"><div class="flex-1"><div class="text-sm font-medium">Working with anyone?</div><div class="text-[12.5px] text-muted-foreground">Add your producer or manager.</div></div>${Button('Invite', { v: 'outline', icon: 'user-plus' })}</div>`,
  })),
];

// ================= FLOW 3 =================
const ReviewHead = () => `${TopBar('Ayo Banks', IconBtn('share-2'))}
  <div class="mt-1 flex items-center gap-3">${Cover('rain', 'h-12 w-12', ic('music', 'size-4'))}<div><div class="text-[13px] text-muted-foreground">Lagos Rain · out 22 Jan</div>${H('Your review', '!text-[24px]')}</div></div>
  <div class="mt-4">${Tabs(['Week 1', 'Day 28'], 0)}</div>`;

const f3 = [
  Screen(1, 'The email', 'Day 7, 9am. Four numbers and one button. Day 28 sends the same with the month.', Phone(`
    <div class="flex items-center justify-between pt-1 text-[13px] text-muted-foreground">${ic('chevron-left')}<span>Inbox</span>${ic('ellipsis')}</div>
    <div class="mt-4 text-[20px] font-semibold leading-snug tracking-tight">How Lagos Rain did in its first week</div>
    <div class="mt-3 flex items-center gap-2.5"><span class="grid h-9 w-9 place-items-center rounded-full bg-primary font-display text-primary-foreground">U</span><div class="flex-1"><div class="text-sm font-medium">Urganize</div><div class="text-[12px] text-muted-foreground">to Kemi · Fri 29 Jan, 9:00</div></div></div>
    <div class="mt-4 rounded-xl border border-border bg-white p-5 text-zinc-900 shadow-sm">
      <div class="flex items-center gap-3">${Cover('rain', 'h-12 w-12')}<div><div class="text-[12px] text-zinc-500">Out 7 days</div><div class="text-[17px] font-semibold">Lagos Rain</div></div></div>
      <p class="mt-4 text-[14px] leading-relaxed text-zinc-700">Good morning Kemi, here’s how the first week went.</p>
      <div class="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200">${[['1,240', 'link clicks'], ['312', 'pre-saves'], ['44/48', 'tasks done'], ['3', 'playlist adds']].map(([v, l]) => `<div class="bg-white p-3"><div class="text-[22px] font-semibold tabular-nums">${v}</div><div class="text-[12px] text-zinc-500">${l}</div></div>`).join('')}</div>
      <div class="mt-5 flex h-11 items-center justify-center rounded-md bg-[#14643a] text-[15px] font-medium text-white">See the full review</div>
      <p class="mt-4 text-[12.5px] text-zinc-500">Add your streams in the review to see the whole picture.</p>
    </div>`)),

  Screen(2, 'What fans did', 'From the smart link. Fills in by itself, no typing.', Phone(`
    ${ReviewHead()}
    <div class="mt-4 grid grid-cols-2 gap-2.5">${Kpi('mouse-pointer-click', '1,240', 'Link clicks', '540 on release day')}${Kpi('bookmark', '312', 'Pre-saves', 'Before 22 Jan')}</div>
    <div class="mt-3">${Card(`${CardHeader('Where fans went', '22 to 29 Jan')}<div class="px-4 pb-4">
      ${BarRow('Spotify', 48, 'bg-emerald-500')}${BarRow('Apple Music', 21, 'bg-rose-500')}${BarRow('Boomplay', 18, 'bg-sky-500')}${BarRow('Audiomack', 13, 'bg-amber-500')}
      ${Source('From your smart link')}</div>`)}</div>
    <div class="mt-3">${Alert('Best day: Fri 22 Jan', '540 clicks. The release day video went up at 6pm.', { icon: 'trending-up', v: 'success' })}</div>`)),

  Screen(3, 'What the team did', 'From the plan. What was on time, what slipped and by how much.', Phone(`
    ${ReviewHead()}
    <div class="mt-4">${Card(`<div class="p-4"><div class="flex items-end justify-between"><div><div class="text-[12.5px] text-muted-foreground">Done on time</div><div class="mt-1 text-[30px] font-semibold leading-none tabular-nums">36<span class="text-lg text-muted-foreground">/44</span></div></div><div class="flex gap-1.5">${Badge('8 late', 'warn')}${Badge('4 open', 'outline')}</div></div>${Progress(82, 'mt-3')}<div class="mt-3 grid grid-cols-3 text-center">${[['12', 'pitches'], ['3', 'playlist adds'], ['11', 'weeks']].map(([v, l], i) => `<div class="${i ? 'border-l border-border' : ''}"><div class="text-[17px] font-semibold tabular-nums">${v}</div><div class="text-[12px] text-muted-foreground">${l}</div></div>`).join('')}</div></div>`)}</div>
    <div class="mt-3">${Card(`${CardHeader('What slipped', 'Most late first')}<div class="px-4 pb-2">
      ${[['Cover art final', 'Pushed the playlist pitch back', '+9 days', 'KO'], ['Spotify editorial pitch', 'Sent 3 days before the cut-off', '+4 days', 'KO'], ['Teaser clips', '2 of 4 posted', '2 missed', 'AB']].map(([t, s, b, w], i) => `<div class="flex items-center gap-3 py-2.5 ${i ? 'border-t border-border' : ''}">${Avatar(w)}<div class="min-w-0 flex-1"><div class="truncate text-[15px]">${t}</div><div class="truncate text-[12.5px] text-muted-foreground">${s}</div></div>${Badge(b, 'warn')}</div>`).join('')}
      ${Source('From your plan')}<div class="h-2"></div></div>`)}</div>`)),

  Screen(4, 'Streams, if you want', 'No store gives us these yet, so the team types them from their dashboards. One minute. Only the team sees them.', Phone(`
    ${ReviewHead()}
    <div class="mt-4">${Card(`${CardHeader('First week streams', 'From each store’s artist dashboard', Badge('Optional', 'outline'))}<div class="flex flex-col gap-3 px-4 pb-4 pt-2">
      ${[['Spotify', '8,420', 'bg-emerald-500'], ['Apple Music', '2,100', 'bg-rose-500'], ['Boomplay', '', 'bg-sky-500'], ['Audiomack', '', 'bg-amber-500']].map(([s, v, d]) => `<div class="flex items-center gap-3"><span class="flex w-[112px] items-center gap-2 text-sm font-medium"><span class="h-2 w-2 rounded-full ${d}"></span>${s}</span>${Input(v, { placeholder: '0', cls: 'h-9 flex-1 text-right text-sm tabular-nums' })}</div>`).join('')}
      ${Button('Save streams', { cls: 'mt-1 w-full' })}
    </div>`)}</div>
    <div class="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">${ic('lock', 'size-3')}Typed in by your team. Only your team sees this.</div>`)),

  Screen(5, 'Three lessons, then the next song', 'Picked from the numbers. Edit any. They go into the next song’s plan.', Phone(`
    ${ReviewHead()}
    <div class="mt-4 flex flex-col gap-2.5">
      ${[['thumbs-up', 'Keep', 'The release day video drove 540 clicks. Do one again.', 'text-primary bg-primary/15'], ['wrench', 'Fix', 'Cover art ran 9 days late. Brief the designer 2 weeks earlier.', 'text-warn bg-warn/15'], ['repeat', 'Change', 'Only 2 of 4 teasers went up. Plan 2 and post both.', 'text-sky-600 bg-sky-500/15 dark:text-sky-300']].map(([icn, k, t, c]) => Card(`<div class="flex gap-3 p-3.5"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c}">${ic(icn, 'size-4')}</span><div class="flex-1"><div class="text-[13px] font-semibold text-muted-foreground">${k}</div><div class="mt-0.5 text-[14.5px] leading-snug">${t}</div></div>${ic('pencil', 'size-3.5 text-muted-foreground mt-1')}</div>`)).join('')}
    </div>
    <div class="mt-3">${Alert('', 'Next plan: cover art 2 weeks earlier, 2 teasers instead of 4.', { icon: 'sparkles', v: 'success' })}</div>`, {
    bottom: Button('Start the next song', { s: 'lg', cls: 'w-full', icon: 'plus' }),
  })),

  Screen(6, 'The loop closes', 'The next song opens with a line that shows what it learned.', Phone(`
    ${TopBar('Ayo Banks', IconBtn('ellipsis'))}
    ${Title(Cover('new', 'h-14 w-14', ic('music', 'size-5')), 'Untitled', 'Single · started today')}
    ${Stepper(0, ['0 of 15', 'No day yet', ''])}
    <div class="mt-5">${Alert('Learned from Lagos Rain', 'Cover art moves 2 weeks earlier and teasers drop to 2. You’ll see it when you pick a release day.', { icon: 'history', v: 'success' })}</div>
    <div class="mt-3">${Card(`<div class="px-4 pt-3.5"><div class="flex items-center justify-between text-sm"><span class="font-semibold">Making the song</span><span class="tabular-nums text-muted-foreground">0 of 15</span></div>${Progress(0, 'mt-2.5')}</div><div class="mt-1 px-4">
      ${Group('Idea', 0, 3, [{ t: 'Write the hook', who: 'AB' }, { t: 'Record a voice note demo', who: 'AB' }, { t: 'Pick the producer', who: 'KO' }])}
      ${Group('Recording', 0, 4, [], { open: false })}
    </div>`)}</div>`, { bottom: Button('Name the song', { v: 'outline', s: 'lg', cls: 'w-full', icon: 'pencil' }) })),
];

// ================= PAGE =================
const decisions = [
  ['One page, three stages', 'Song, Release and Out sit on one project page. The tasks change with the stage. You never jump to another page.'],
  ['The checklist is there from the start', 'Open a project and the full list is already there, in order. No “suggested” tasks to add one by one.'],
  ['No dates until a release day', 'Making a song doesn’t run to a deadline. Dates appear when you pick a day.'],
  ['The review closes the loop', 'Fans, team and streams in one page, by email too. Three lessons go into the next song’s plan.'],
];
const uiChanges = [
  ['Stage track instead of three boxes', 'One line with three points. You see where you are and how far there is to go at a glance.'],
  ['Groups that fold', 'Finished groups shrink to one line with a tick, so the screen shows only what’s left.'],
  ['One action at the bottom', 'The main button sits in a fixed bar at the bottom, in thumb reach, on every screen.'],
  ['Colour means something', 'Green is done or today, amber is late. People get their own colour. Less beige, more contrast.'],
  ['Cover art on every song', 'A square per song, so lists are quick to scan. Before there’s art it uses the song’s colour.'],
  ['Fewer fonts', 'The serif only for page titles. Mono capitals are gone. Everything else is one clean sans.'],
];
const asks = [
  ['Fold Idea and Making into one Song stage', 'with groups (Idea, Recording, Finishing, Paperwork)? This changes what you approved on 4 Nov.'],
  ['The song checklist', 'is 15 tasks in four groups. Anything missing for a Nigerian release, or anything to cut?'],
  ['Typed streams', 'come back, in the private review only. They were cut from the public recap card on 10 Aug.'],
  ['The review email', 'on day 7 and day 28, to the manager (or the artist when there’s no manager).'],
  ['Lessons', 'come from a fixed list matched to the numbers, so they work with the AI off. The AI only rewords them.'],
];

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Song to review mocks</title>
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
  --board: 228 228 231;
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
  --board: 9 9 11;
}
@tailwind base; @tailwind components; @tailwind utilities;
body { font-family: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
</style>
</head>
<body class="min-h-screen bg-zinc-200 px-4 pb-24 pt-10 dark:bg-zinc-950">
  <header class="mx-auto max-w-[880px]">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mocks v2 · 9 Nov 2026 · issue #1143</div>
      <div class="inline-flex h-9 items-center rounded-lg bg-zinc-300/70 p-1 text-sm dark:bg-zinc-800">
        <button data-set="dark" class="theme-btn rounded-md px-3 py-1 font-medium">Dark</button>
        <button data-set="light" class="theme-btn rounded-md px-3 py-1 font-medium">Light</button>
      </div>
    </div>
    <h1 class="mt-4 text-[36px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">One flow: from the song to the review</h1>
    <p class="mt-3 max-w-[65ch] text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">You open a project for a song and the checklist is there. Pick a release day and the same project becomes the rollout. After release, a review feeds the next song. Built from the app’s shadcn components, with a cleaner look than today’s app. Names and numbers are made up.</p>

    <div class="mt-8 flex flex-wrap items-center gap-2 text-sm">
      ${[['Song', 'Checklist, no dates'], ['Release', 'Pick a day, the plan builds'], ['Out', 'After-release tasks'], ['Review', 'Day 7 and day 28'], ['Next song', 'Lessons go in']].map(([t, s], i, a) => `<div class="rounded-lg border px-3 py-2 ${i === a.length - 1 ? 'border-emerald-600/40 bg-emerald-600/10' : 'border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-900'}"><div class="font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="text-[12.5px] text-zinc-500">${s}</div></div>${i < a.length - 1 ? `<span class="text-zinc-400">${ic('arrow-right', 'size-4')}</span>` : ''}`).join('')}
    </div>

    <div class="mt-8 grid gap-3 sm:grid-cols-2">
      ${decisions.map(([t, d]) => `<div class="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div class="font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="mt-1 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">${d}</div></div>`).join('')}
    </div>

    <div class="mt-10 text-xs font-semibold uppercase tracking-wider text-zinc-500">What’s better than today’s UI</div>
    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      ${uiChanges.map(([t, d]) => `<div class="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div class="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">${t}</div><div class="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">${d}</div></div>`).join('')}
    </div>
  </header>

  ${Flow('Flow 1 of 3', 'The full flow: song, release, out', 'Kemi manages Ayo Banks. Ayo has a new song idea, “Lagos Rain”.', f1)}
  ${Flow('Flow 2 of 3', 'A brand-new user', 'Tolu is an artist who has never used Urganize. From the first screen to ticking a task in under two minutes: three questions, then the checklist.', f2)}
  ${Flow('Flow 3 of 3', 'Closing the loop: the review', 'Lagos Rain came out on Fri 22 Jan. The review arrives on day 7 and again on day 28. Fan and team numbers fill in by themselves. Streams are typed in, if the team wants.', f3)}

  <section class="mx-auto mt-24 max-w-[880px]">
    <h2 class="text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">What I need from you</h2>
    <ol class="mt-4 flex flex-col gap-2.5">${asks.map(([b, t], i) => `<li class="flex gap-3 rounded-xl border border-zinc-300 bg-white p-4 text-[14.5px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"><span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-[12px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">${i + 1}</span><span><b class="text-zinc-900 dark:text-zinc-100">${b}</b> ${t}</span></li>`).join('')}</ol>
    <h2 class="mt-10 text-[24px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Measured vs assumed</h2>
    <ul class="mt-3 flex flex-col gap-2 text-[14.5px] text-zinc-600 dark:text-zinc-400">
      <li><b class="text-zinc-900 dark:text-zinc-100">Measured today:</b> link clicks, pre-saves and stores come from Altlink, once a release has a UPC or ISRC. On time and late come from the plan.</li>
      <li><b class="text-zinc-900 dark:text-zinc-100">Assumed:</b> that teams will type streams in. No click data exists for any of this yet.</li>
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
