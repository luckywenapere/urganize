// The morning brief (#1207, Oyin, 11 Nov 2026): every morning at 8am Lagos a
// short brief waits at the bottom of the person's one Assistant chat, in four
// parts: what needs you today, what changed since yesterday, what is coming up,
// and one next step.
//
// This module is pure and client-safe. The cron (lib/chappi/morning-brief-
// server.ts) gathers the data and calls buildMorningBrief; the chat renders the
// payload (components/chappi/ChappiBriefCard.tsx) after reading it back through
// sanitizeMorningBrief. The FACTS always come from code. AI may only rewrite
// the opening line and pick which item to do first (applyBriefWording), and a
// brief without AI is complete on its own.

export const MORNING_BRIEF_VERSION = 1;

/** How many lines each section may show. A brief is read in a minute. */
export const BRIEF_SECTION_LIMIT = 4;
/** How far ahead "Coming up" looks. */
export const BRIEF_UPCOMING_DAYS = 14;
/** How far ahead "Needs you" looks for work not yet late or due today. */
export const BRIEF_WEEK_DAYS = 7;

const MAX_TEXT = 160;
const MAX_META = 60;
const MAX_LEDE = 200;
const MAX_GREETING = 60;

export type MorningBriefTone = 'late' | 'good' | 'plain';

export type MorningBriefItem = {
  text: string;
  meta?: string;
  tone?: MorningBriefTone;
  /** Opens this task in the task panel. */
  taskId?: string;
  /** An in-app path to open. Always starts with a single slash. */
  href?: string;
};

export type MorningBriefNext = {
  text: string;
  /** The button's words. */
  label: string;
  taskId?: string;
  href?: string;
};

export type MorningBrief = {
  v: typeof MORNING_BRIEF_VERSION;
  /** The Lagos calendar day the brief is for, YYYY-MM-DD. */
  date: string;
  greeting: string;
  lede: string;
  needs: MorningBriefItem[];
  changed: MorningBriefItem[];
  upcoming: MorningBriefItem[];
  next: MorningBriefNext | null;
};

// ── Inputs ─────────────────────────────────────────────────────────────────

export type BriefTask = {
  id: string;
  title: string;
  releaseId: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  assignedToUserId: string | null;
  assigneeName?: string | null;
};

export type BriefRelease = {
  id: string;
  title: string;
  artistName: string;
  releaseDate: string | null;
};

export type BriefInput = {
  userId: string;
  firstName: string;
  tasks: readonly BriefTask[];
  releases: readonly BriefRelease[];
  /** Start of "since yesterday". */
  since: Date;
  now: Date;
};

// ── Lagos calendar ────────────────────────────────────────────────────────

/** Lagos is UTC+1 all year (no daylight saving), so a fixed offset is exact. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Lagos calendar day for an instant, YYYY-MM-DD. */
export function lagosDateKey(at: Date): string {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole Lagos calendar days from `now` to the day `date` falls on. */
export function lagosDaysUntil(date: string, now: Date): number | null {
  const target = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date);
  if (!Number.isFinite(target)) return null;
  const targetDay = date.length === 10 ? date : lagosDateKey(new Date(target));
  const today = lagosDateKey(now);
  return Math.round((Date.parse(`${targetDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 20 Nov" for a Lagos calendar day. */
export function shortDayLabel(date: string): string {
  const day = date.length === 10 ? date : lagosDateKey(new Date(date));
  const at = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(at.getTime())) return '';
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// ── Building it ────────────────────────────────────────────────────────────

const CLOSED = new Set(['done', 'cancelled', 'canceled', 'archived']);

function isClosed(status: string): boolean {
  return CLOSED.has(status);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').replace(/—/g, ',').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function withRelease(title: string, releaseTitle: string | null | undefined): string {
  return releaseTitle ? `${title} · ${releaseTitle}` : title;
}

/**
 * Builds the brief from the facts alone. Never throws. Quiet days still get a
 * brief: the founder wants it every morning so the habit holds.
 */
export function buildMorningBrief(input: BriefInput): MorningBrief {
  const { now, userId } = input;
  const releaseById = new Map(input.releases.map((release) => [release.id, release]));
  const releaseTitle = (id: string | null) => (id ? releaseById.get(id)?.title ?? null : null);

  // What needs you: your own open work, latest first by urgency.
  type Scored = { item: MorningBriefItem; rank: number; days: number };
  const mine: Scored[] = [];
  for (const task of input.tasks) {
    if (task.assignedToUserId !== userId || isClosed(task.status) || !task.dueDate) continue;
    const days = lagosDaysUntil(task.dueDate, now);
    if (days === null || days > BRIEF_WEEK_DAYS) continue;
    let meta: string;
    let tone: MorningBriefTone = 'plain';
    if (days < 0) {
      meta = `${plural(-days, 'day', 'days')} late`;
      tone = 'late';
    } else if (days === 0) {
      meta = 'Due today';
    } else if (days === 1) {
      meta = 'Due tomorrow';
    } else {
      meta = `Due ${shortDayLabel(task.dueDate)}`;
    }
    mine.push({
      item: { text: clip(withRelease(task.title, releaseTitle(task.releaseId)), MAX_TEXT), meta, tone, taskId: task.id },
      rank: days < 0 ? 0 : days === 0 ? 1 : 2,
      days,
    });
  }
  mine.sort((a, b) => a.rank - b.rank || a.days - b.days);
  const lateCount = mine.filter((entry) => entry.rank === 0).length;
  const todayCount = mine.filter((entry) => entry.rank === 1).length;
  const needs = mine.slice(0, BRIEF_SECTION_LIMIT).map((entry) => entry.item);

  // What changed since yesterday: work teammates finished on rollouts you see.
  const since = input.since.getTime();
  const changed: MorningBriefItem[] = input.tasks
    .filter((task) => {
      if (task.status !== 'done' || !task.completedAt) return false;
      if (task.assignedToUserId === userId) return false;
      const at = Date.parse(task.completedAt);
      return Number.isFinite(at) && at >= since && at <= now.getTime();
    })
    .sort((a, b) => Date.parse(b.completedAt ?? '') - Date.parse(a.completedAt ?? ''))
    .slice(0, BRIEF_SECTION_LIMIT)
    .map((task) => {
      const who = task.assigneeName?.trim().split(/\s+/)[0];
      const title = releaseTitle(task.releaseId);
      return {
        text: clip(who ? `${who} finished ${task.title}` : `${task.title} is done`, MAX_TEXT),
        ...(title ? { meta: clip(title, MAX_META) } : {}),
        tone: 'good' as const,
        ...(task.releaseId ? { href: `/dashboard?release=${task.releaseId}` } : {}),
      };
    });

  // Coming up: release days in the next two weeks.
  const soon = input.releases
    .map((release) => ({
      release,
      days: release.releaseDate ? lagosDaysUntil(release.releaseDate, now) : null,
    }))
    .filter(
      (entry): entry is { release: BriefRelease; days: number } =>
        entry.days !== null && entry.days >= 0 && entry.days <= BRIEF_UPCOMING_DAYS
    )
    .sort((a, b) => a.days - b.days)
    .slice(0, BRIEF_SECTION_LIMIT);
  const upcoming: MorningBriefItem[] = soon.map(({ release, days }) => ({
    text: clip(days === 0 ? `${release.title} comes out today` : `${release.title} comes out`, MAX_TEXT),
    meta: days === 0 ? clip(release.artistName, MAX_META) : `${shortDayLabel(release.releaseDate ?? '')} · ${plural(days, 'day', 'days')}`,
    tone: 'plain' as const,
    href: `/dashboard?release=${release.id}`,
  }));

  const nearest = soon[0]?.release ?? null;
  const nearestDays = soon[0]?.days ?? null;

  return {
    v: MORNING_BRIEF_VERSION,
    date: lagosDateKey(now),
    greeting: clip(`Good morning, ${input.firstName || 'there'}`, MAX_GREETING),
    lede: templateLede({ lateCount, todayCount, changedCount: changed.length, nearest, nearestDays }),
    needs,
    changed,
    upcoming,
    next: templateNext(needs, nearest),
  };
}

function templateLede(facts: {
  lateCount: number;
  todayCount: number;
  changedCount: number;
  nearest: BriefRelease | null;
  nearestDays: number | null;
}): string {
  const parts: string[] = [];
  if (facts.nearest && facts.nearestDays !== null) {
    parts.push(
      facts.nearestDays === 0
        ? `${facts.nearest.title} comes out today.`
        : `${facts.nearest.title} comes out in ${plural(facts.nearestDays, 'day', 'days')}.`
    );
  }
  if (facts.lateCount > 0) {
    parts.push(`${plural(facts.lateCount, 'thing is', 'things are')} late.`);
  } else if (facts.todayCount > 0) {
    parts.push(`${plural(facts.todayCount, 'thing is', 'things are')} due today.`);
  }
  if (parts.length === 0) {
    return facts.changedCount > 0
      ? 'Nothing is late. Here is what your team got done.'
      : 'Nothing is late and nothing changed overnight.';
  }
  return clip(parts.join(' '), MAX_LEDE);
}

function templateNext(needs: readonly MorningBriefItem[], nearest: BriefRelease | null): MorningBriefNext | null {
  const first = needs[0];
  if (first?.taskId) {
    const title = first.text.split(' · ')[0];
    const why =
      first.tone === 'late' && first.meta
        ? ` It is ${first.meta.toLowerCase()}.`
        : first.meta === 'Due today'
          ? ' It is due today.'
          : '';
    return { text: clip(`${title} first.${why}`, MAX_TEXT), label: 'Open it', taskId: first.taskId };
  }
  if (nearest) {
    return {
      text: clip(`Check what is left on ${nearest.title} while it is quiet.`, MAX_TEXT),
      label: 'Open the rollout',
      href: `/dashboard?release=${nearest.id}`,
    };
  }
  return null;
}

// ── AI wording ─────────────────────────────────────────────────────────────

/** What AI is allowed to change: the opening line, and which need comes first. */
export type BriefWording = {
  lede: string;
  /** Index into `needs`, or -1 to keep the template's choice. */
  firstNeed: number;
  nextText: string;
};

/** The system and user messages for the wording call. */
export function buildBriefWordingMessages(brief: MorningBrief): { role: 'system' | 'user'; content: string }[] {
  const facts = {
    needs: brief.needs.map((item, index) => ({ index, text: item.text, when: item.meta })),
    changed: brief.changed.map((item) => item.text),
    upcoming: brief.upcoming.map((item) => `${item.text} (${item.meta})`),
  };
  return [
    {
      role: 'system',
      content: [
        'You write the opening of a music manager\'s morning brief in Urganize.',
        'Use only the facts given. Never invent a task, a date, a person or a number.',
        'Plain words a 10 year old understands. Short sentences. No em dashes, no emoji, no hype, no exclamation marks.',
        'Say "rollout" for a release being planned, never "workspace".',
        'Reply as JSON: {"lede": one or two sentences under 160 characters, "firstNeed": the index of the one need to do first or -1 if there are none, "nextText": one sentence under 110 characters saying what to do first and why}.',
      ].join(' '),
    },
    { role: 'user', content: JSON.stringify(facts) },
  ];
}

export const BRIEF_WORDING_SCHEMA = {
  name: 'morning_brief_wording',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lede', 'firstNeed', 'nextText'],
    properties: {
      lede: { type: 'string' },
      firstNeed: { type: 'integer' },
      nextText: { type: 'string' },
    },
  },
} as const;

/** Reads the model's answer. Null when it is not usable. */
export function parseBriefWording(raw: string, needsCount: number): BriefWording | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const { lede, firstNeed, nextText } = value as Record<string, unknown>;
  if (typeof lede !== 'string' || typeof nextText !== 'string' || typeof firstNeed !== 'number') return null;
  if (!Number.isInteger(firstNeed) || firstNeed < -1 || firstNeed >= needsCount) return null;
  const cleanLede = clip(lede, MAX_LEDE);
  const cleanNext = clip(nextText, MAX_TEXT);
  if (!cleanLede) return null;
  return { lede: cleanLede, firstNeed, nextText: cleanNext };
}

/** Applies AI's wording to a brief built from the facts. Facts never change. */
export function applyBriefWording(brief: MorningBrief, wording: BriefWording | null): MorningBrief {
  if (!wording) return brief;
  const next: MorningBrief = { ...brief, lede: wording.lede };
  const chosen = wording.firstNeed >= 0 ? brief.needs[wording.firstNeed] : undefined;
  if (chosen?.taskId && wording.nextText) {
    next.next = { text: wording.nextText, label: 'Open it', taskId: chosen.taskId };
  } else if (brief.next && wording.nextText && wording.firstNeed === -1 && !brief.next.taskId) {
    next.next = { ...brief.next, text: wording.nextText };
  }
  return next;
}

// ── Plain text, for the model's history and for the push ───────────────────

/** The brief as plain text: what the chat's model reads back as history. */
export function morningBriefText(brief: MorningBrief): string {
  const lines = [`${brief.greeting}. ${brief.lede}`];
  const section = (title: string, items: readonly MorningBriefItem[]) => {
    if (items.length === 0) return;
    lines.push('', `${title}:`);
    for (const item of items) lines.push(`- ${item.text}${item.meta ? ` (${item.meta})` : ''}`);
  };
  section('Needs you today', brief.needs);
  section('Since yesterday', brief.changed);
  section('Coming up', brief.upcoming);
  if (brief.next) lines.push('', `First: ${brief.next.text}`);
  return lines.join('\n');
}

/** The push body: one line, the most useful fact first. */
export function morningBriefPushBody(brief: MorningBrief): string {
  return clip(brief.lede, MAX_TEXT);
}

// ── Reading a stored payload back ──────────────────────────────────────────

function cleanItem(raw: unknown): MorningBriefItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const { text, meta, tone, taskId, href } = raw as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim()) return null;
  const item: MorningBriefItem = { text: clip(text, MAX_TEXT) };
  if (typeof meta === 'string' && meta.trim()) item.meta = clip(meta, MAX_META);
  if (tone === 'late' || tone === 'good' || tone === 'plain') item.tone = tone;
  if (typeof taskId === 'string' && /^[0-9a-f-]{36}$/i.test(taskId)) item.taskId = taskId;
  if (typeof href === 'string' && isInAppPath(href)) item.href = href;
  return item;
}

/** Only an in-app path: one leading slash, no scheme, no backslash. */
export function isInAppPath(href: string): boolean {
  return href.length <= 300 && href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');
}

function cleanItems(raw: unknown): MorningBriefItem[] {
  if (!Array.isArray(raw)) return [];
  const items: MorningBriefItem[] = [];
  for (const entry of raw) {
    const item = cleanItem(entry);
    if (item) items.push(item);
    if (items.length >= BRIEF_SECTION_LIMIT) break;
  }
  return items;
}

/**
 * Validates a stored or sent brief. Null when it is not one. The chat keeps a
 * message whose brief does not parse, and shows its plain text instead.
 */
export function sanitizeMorningBrief(raw: unknown): MorningBrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.v !== MORNING_BRIEF_VERSION) return null;
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  if (typeof value.greeting !== 'string' || typeof value.lede !== 'string') return null;
  let next: MorningBriefNext | null = null;
  if (value.next && typeof value.next === 'object') {
    const { text, label, taskId, href } = value.next as Record<string, unknown>;
    if (typeof text === 'string' && text.trim() && typeof label === 'string' && label.trim()) {
      next = { text: clip(text, MAX_TEXT), label: clip(label, 40) };
      if (typeof taskId === 'string' && /^[0-9a-f-]{36}$/i.test(taskId)) next.taskId = taskId;
      if (typeof href === 'string' && isInAppPath(href)) next.href = href;
    }
  }
  return {
    v: MORNING_BRIEF_VERSION,
    date: value.date,
    greeting: clip(value.greeting, MAX_GREETING),
    lede: clip(value.lede, MAX_LEDE),
    needs: cleanItems(value.needs),
    changed: cleanItems(value.changed),
    upcoming: cleanItems(value.upcoming),
    next,
  };
}
