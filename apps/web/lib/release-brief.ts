/**
 * The release brief (URG-281, 2026-10-16): one page per rollout that the team
 * reads instead of scrolling WhatsApp. The idea, references, dates, who is on
 * what, the decisions made, and any notes already tied to the rollout.
 *
 * THIS FILE IS THE PURE HALF. No I/O, no React, no environment reads, so every
 * rule here is held by vitest (lib/release-brief.test.ts). The database side is
 * lib/release-brief-server.ts; the screens are components/releases/
 * ReleaseBriefScene.tsx and app/brief/[token]/page.tsx.
 *
 * What is STORED vs what is DERIVED is the design:
 *  - Stored (four tables, migration 20261016120000_release_briefs.sql): the
 *    idea text, references, decisions, a short edit history, and the view link.
 *  - Derived on every read, never copied: Dates (from the rollout's dated key
 *    tasks and its release day) and Who's on what (from task assignees). So
 *    there is no second place to type a date, and the brief cannot drift from
 *    the plan.
 */

import type { BriefFeel, BriefProgress } from '@/lib/brief-board';
import type { BoardLayout, NoteKey } from '@/lib/brief-board-layout';
import type { BriefPiece } from '@/lib/brief-pieces';
import type { BriefSeen } from '@/lib/brief-present';
import { readPlanKey } from '@/lib/plan-focus';
import { channelLabel, type Channel } from '@/lib/planner-v2/answers';
import { readUndatedTaskMeta, relativeWhenLabel } from '@/lib/planner-v2/when';
import { isTaskClosed } from '@/types/tasks';

// ── Limits ───────────────────────────────────────────────────────────────────

export const MAX_IDEA_LENGTH = 4000;
export const MAX_DECISION_LENGTH = 280;
export const MAX_REFERENCE_TITLE_LENGTH = 120;
export const MAX_REFERENCE_URL_LENGTH = 2000;
export const MAX_REFERENCES = 40;
/** The edit history keeps this many rows per rollout; older ones are trimmed on insert. */
export const MAX_REVISIONS = 30;
/** Dates block: at most this many rows, release day included. */
export const MAX_DATE_ROWS = 6;
/** Notes block: the newest this many notes tied to the rollout. */
export const MAX_NOTES = 10;

// ── Blocks and copy ──────────────────────────────────────────────────────────

export const BRIEF_BLOCKS = ['idea', 'references', 'decisions', 'feel'] as const;
export type BriefBlock = (typeof BRIEF_BLOCKS)[number];

export const BRIEF_BLOCK_LABELS: Record<BriefBlock, string> = {
  idea: 'Idea',
  references: 'References',
  decisions: 'Decisions',
  feel: 'Look and feel',
};

export function isBriefBlock(value: unknown): value is BriefBlock {
  return typeof value === 'string' && (BRIEF_BLOCKS as readonly string[]).includes(value);
}

/** The revision author label used when UrgAns wrote the change. */
export const URGANS_ACTOR_LABEL = 'UrgAns';

export const BRIEF_COPY = {
  loadError: 'Couldn’t load the brief.',
  notReady: 'The brief is not set up yet.',
  emptyTitle: 'One page for the whole team.',
  emptyLine: 'The idea, references and decisions. No more scrolling WhatsApp.',
  draft: 'Draft with UrgAns',
  polish: 'Rewrite with UrgAns',
  fromPlan: 'Written from your plan',
  writeYourself: 'Write it yourself',
  drafted: 'UrgAns drafted this',
  shareTitle: 'Share the brief',
  shareLine: 'Your team sees it in Urganize.',
  viewLink: 'View link',
  viewLinkLine: 'Anyone with the link can read. No editing.',
  copyLink: 'Copy link',
  addDecision: 'Add a decision',
} as const;

// ── Shapes the API answers with ─────────────────────────────────────────────

export type BriefBoardFacts = {
  title: string;
  artistName: string;
  /** Signed link to the cover art, or null when there is none. */
  coverUrl: string | null;
  releaseDate: string | null;
  /** Lagos today, YYYY-MM-DD, so the page and the server agree on what is late. */
  today: string;
  progress: BriefProgress;
  feel: BriefFeel;
  /** Where a lead put each card, or null for the default layout (#897 phase 1b). */
  layout: BoardLayout | null;
  /** Team owner or admin, or the rollout's owner: may move and resize cards. */
  canArrange: boolean;
  /** Sticky notes, oldest first; their places are in `layout`. */
  stickies: BriefSticky[];
  /** What we're making (#897 phase 3): the pieces, with who has each. */
  pieces: {
    items: (BriefPiece & { assigneeName: string | null; assigneeInitials: string | null })[];
    done: number;
    total: number;
    late: number;
  };
  /** Who on the team has opened the brief (#897 phase 4). */
  seen: BriefSeen;
};

export type BriefReference = {
  id: string;
  kind: 'link' | 'image';
  url: string;
  title: string | null;
  /** The source host as a person says it ("Spotify", "YouTube", "example.com"). */
  source: string;
  createdBy: string | null;
  createdAt: string;
  /** A photo uploaded to the brief (#897 phase 2); `url` is then a signed link that expires. */
  uploaded: boolean;
};

export type BriefDecision = {
  id: string;
  body: string;
  createdBy: string | null;
  authorName: string;
  createdAt: string;
  /** Where an UrgAns-written decision came from ("Kemi"); null when a person typed it. */
  source?: string | null;
};

export type BriefDateRow = {
  id: string;
  title: string;
  /** YYYY-MM-DD in Lagos time. */
  date: string;
  done: boolean;
  isRelease: boolean;
  /** Set when the plan has no release day yet: "Now", "4 weeks before", "Pick a day". `date` is '' then. */
  when?: string;
};

/** What the approved plan already says, offered to an empty brief. */
export type BriefPlanSeed = { idea: string; decisions: string[] };

export type BriefPerson = {
  key: string;
  name: string;
  initials: string;
  nextTask: string | null;
  openCount: number;
};

export type BriefNote = {
  id: string;
  body: string;
  createdAt: string;
};

export type BriefRevision = {
  id: string;
  block: BriefBlock;
  actorName: string;
  initials: string;
  isUrgans: boolean;
  createdAt: string;
};

export type BriefPayload = {
  releaseId: string;
  idea: string;
  updatedAt: string | null;
  updatedByName: string | null;
  references: BriefReference[];
  decisions: BriefDecision[];
  dates: BriefDateRow[];
  people: BriefPerson[];
  notes: BriefNote[];
  revisions: BriefRevision[];
  /** From the approved plan (planner v2); null when there is none or it has nothing to offer. */
  planSeed: BriefPlanSeed | null;
  share: { enabled: boolean; token: string | null };
  viewer: { id: string; canEdit: boolean; canManageShare: boolean };
  /** The idea round and approval (2026-10-27); absent with the flag off. */
  round?: BriefRound | null;
  /** Everyone's ideas, once the round is closed (or all of them for the owner). */
  ideas?: BriefIdea[];
  /** What the board shows around the blocks (#897): the record, the look and feel, live progress. */
  board: BriefBoardFacts;
};

export type BriefRound = {
  state: 'open' | 'closed' | 'approved';
  toSettle: { id: string; question: string; options: { text: string; by: string[] }[] }[];
  approvedAt: string | null;
  approvedByName: string | null;
  version: number;
  /** The viewer may settle, approve and start a new version. */
  canRun: boolean;
};

export type BriefIdea = {
  id: string;
  authorName: string;
  initials: string;
  content: string;
  audioUrl: string | null;
  audioSeconds: number | null;
};

/** What the public view link shows: no decisions, people or notes. */
export type PublicBriefPayload = {
  artistName: string;
  title: string;
  releaseDate: string | null;
  idea: string;
  references: BriefReference[];
  dates: BriefDateRow[];
};

/** Nothing a person wrote yet: the empty state shows instead of the blocks. */
export function isBriefEmpty(brief: Pick<BriefPayload, 'idea' | 'references' | 'decisions'>): boolean {
  return !brief.idea.trim() && brief.references.length === 0 && brief.decisions.length === 0;
}

// ── Input parsing ────────────────────────────────────────────────────────────

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseIdea(body: unknown): Parsed<string> {
  const raw = (body as { idea?: unknown } | null)?.idea;
  if (typeof raw !== 'string') return { ok: false, error: 'Idea must be text.' };
  // Line breaks are kept (the one formatting the brief allows); trailing space is not.
  const idea = raw.replace(/\r\n/g, '\n').replace(/\s+$/u, '');
  if (idea.length > MAX_IDEA_LENGTH) {
    return { ok: false, error: `Keep the idea under ${MAX_IDEA_LENGTH} characters.` };
  }
  return { ok: true, value: idea };
}

export function parseDecision(body: unknown): Parsed<string> {
  const raw = (body as { body?: unknown } | null)?.body;
  if (typeof raw !== 'string') return { ok: false, error: 'Write the decision first.' };
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, error: 'Write the decision first.' };
  if (text.length > MAX_DECISION_LENGTH) {
    return { ok: false, error: `Keep a decision to one line (${MAX_DECISION_LENGTH} characters).` };
  }
  return { ok: true, value: text };
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

/** A link that points straight at an image file renders as a thumbnail. */
export function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return IMAGE_EXTENSION.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

export function normalizeReferenceUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_REFERENCE_URL_LENGTH) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type ReferenceDraft = {
  kind: 'link' | 'image';
  url: string;
  title: string | null;
  /** An uploaded photo's place in storage; its url is then empty. */
  storagePath?: string | null;
};

/** A sticky note on the board (#897 phase 2). */
export type BriefSticky = {
  id: string;
  key: NoteKey;
  text: string;
  authorName: string;
  createdBy: string | null;
};

export function parseReference(body: unknown): Parsed<ReferenceDraft> {
  const input = (body || {}) as { url?: unknown; title?: unknown };
  const url = typeof input.url === 'string' ? normalizeReferenceUrl(input.url) : null;
  if (!url) return { ok: false, error: 'Paste a full link, like https://open.spotify.com/…' };
  const rawTitle = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : '';
  if (rawTitle.length > MAX_REFERENCE_TITLE_LENGTH) {
    return { ok: false, error: `Keep the caption under ${MAX_REFERENCE_TITLE_LENGTH} characters.` };
  }
  return {
    ok: true,
    value: { kind: isImageUrl(url) ? 'image' : 'link', url, title: rawTitle || null },
  };
}

// ── Link presentation ────────────────────────────────────────────────────────

const KNOWN_SOURCES: { match: RegExp; label: string; color: string }[] = [
  { match: /(^|\.)spotify\.com$/, label: 'Spotify', color: '#1ed760' },
  { match: /(^|\.)(youtube\.com|youtu\.be)$/, label: 'YouTube', color: '#ff3b30' },
  { match: /(^|\.)music\.apple\.com$/, label: 'Apple Music', color: '#fa2d48' },
  { match: /(^|\.)soundcloud\.com$/, label: 'SoundCloud', color: '#ff7700' },
  { match: /(^|\.)instagram\.com$/, label: 'Instagram', color: '#e1306c' },
  { match: /(^|\.)tiktok\.com$/, label: 'TikTok', color: '#25f4ee' },
  { match: /(^|\.)pinterest\.[a-z.]+$/, label: 'Pinterest', color: '#e60023' },
  { match: /(^|\.)(x\.com|twitter\.com)$/, label: 'X', color: '#e7e9ea' },
  { match: /(^|\.)drive\.google\.com$/, label: 'Drive', color: '#4285f4' },
  { match: /(^|\.)audiomack\.com$/, label: 'Audiomack', color: '#ffa200' },
  { match: /(^|\.)boomplay\.com$/, label: 'Boomplay', color: '#3ad1ff' },
];

/** "Spotify" for open.spotify.com, else the bare host without www. */
export function referenceSource(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
  const known = KNOWN_SOURCES.find((source) => source.match.test(host));
  if (known) return known.label;
  return host.replace(/^www\./, '');
}

/** The colour dot beside a link row: the platform's own colour when known. */
export function referenceColor(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return '#3a3a3d';
  }
  const known = KNOWN_SOURCES.find((source) => source.match.test(host));
  if (known) return known.color;
  // A stable muted hue per host, so the same site always gets the same dot.
  let hash = 0;
  for (const char of host) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 35% 45%)`;
}

/** What a link row says when nobody wrote a caption. */
export function referenceDisplayTitle(reference: Pick<BriefReference, 'title' | 'url'>): string {
  if (reference.title) return reference.title;
  try {
    const url = new URL(reference.url);
    const path = url.pathname.replace(/\/+$/, '');
    return path && path !== '/' ? `${url.hostname.replace(/^www\./, '')}${path}` : url.hostname.replace(/^www\./, '');
  } catch {
    return reference.url;
  }
}

// ── People ───────────────────────────────────────────────────────────────────

export function firstName(name: string | null | undefined, email?: string | null): string {
  const clean = (name || '').trim();
  if (clean) return clean.split(/\s+/)[0];
  const local = (email || '').split('@')[0]?.trim();
  return local || 'Someone';
}

export function initialsFor(name: string | null | undefined, email?: string | null): string {
  const clean = (name || '').trim();
  if (clean) {
    const parts = clean.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
    return letters.toUpperCase();
  }
  const local = (email || '').split('@')[0] || '';
  return (local.slice(0, 2) || '?').toUpperCase();
}

/**
 * Who may switch the view link on or off: the rollout's owner, or an owner or
 * admin of the owner's team (the same "managers" the spend rule names). Members
 * and guests may copy a link that is already on, never change it.
 */
export function canManageBriefShare(input: {
  releaseOwnerId: string;
  userId: string;
  memberRole: string | null | undefined;
}): boolean {
  if (input.releaseOwnerId && input.releaseOwnerId === input.userId) return true;
  return input.memberRole === 'owner' || input.memberRole === 'admin';
}

// ── Derived blocks ───────────────────────────────────────────────────────────

/** The task fields the derived blocks read. Plain rows, as the server loads them. */
export type BriefTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  assigned_to_user_id: string | null;
  metadata: unknown;
  position?: number | null;
  /** The task's notes; the first line is a piece's one-line spec (#897 phase 3). */
  description?: string | null;
};


function isMilestoneMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const template = (metadata as { template?: unknown }).template;
  if (!template || typeof template !== 'object') return false;
  return (template as { task_type?: unknown }).task_type === 'event_milestone';
}

/** A timestamp as a YYYY-MM-DD day in Lagos (UTC+1 all year). A bare date passes through. */
export function lagosDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The Dates block. Read-only, from the plan: the rollout's milestones and key
 * tasks (planner `key`), or every dated task when the plan marks none. The
 * window is the last thing done plus what comes next, then release day in
 * accent, never more than {@link MAX_DATE_ROWS} rows.
 */
export function deriveBriefDates(input: {
  tasks: BriefTaskRow[];
  releaseDate: string | null;
  today: string;
}): BriefDateRow[] {
  const releaseDay = lagosDay(input.releaseDate);
  if (!releaseDay && !input.tasks.some((task) => lagosDay(task.due_date))) {
    const undated = deriveUndatedBriefDates(input.tasks);
    if (undated) return undated;
  }
  const dated = input.tasks
    .map((task) => ({ task, day: lagosDay(task.due_date) }))
    .filter((entry): entry is { task: BriefTaskRow; day: string } => entry.day !== null)
    .filter((entry) => String(entry.task.status || '') !== 'cancelled')
    // Release day is its own row; a task on or after it is the rollout's tail.
    .filter((entry) => !releaseDay || entry.day < releaseDay);

  const key = dated.filter(
    (entry) => isMilestoneMetadata(entry.task.metadata) || readPlanKey(entry.task.metadata) === true
  );
  const pool = (key.length > 0 ? key : dated).sort(
    (a, b) => a.day.localeCompare(b.day) || (a.task.position ?? 0) - (b.task.position ?? 0)
  );

  const isDone = (entry: { task: BriefTaskRow }) => String(entry.task.status || '') === 'done';
  const upcoming = pool.filter((entry) => !isDone(entry) && entry.day >= input.today);
  const behind = pool.filter((entry) => !isDone(entry) && entry.day < input.today);
  const done = pool.filter(isDone);

  const room = MAX_DATE_ROWS - (releaseDay ? 1 : 0);
  // Open work that slipped first (it still needs doing), then the next ones,
  // with the most recent done item kept as the anchor when there is room.
  const picked = [...behind.slice(-2), ...upcoming];
  const lastDone = done[done.length - 1];
  const rows = lastDone && picked.length < room ? [lastDone, ...picked] : picked;
  const chosen = rows.slice(0, room).sort((a, b) => a.day.localeCompare(b.day));

  const out: BriefDateRow[] = chosen.map((entry) => ({
    id: entry.task.id,
    title: (entry.task.title || '').trim() || 'Untitled',
    date: entry.day,
    done: isDone(entry),
    isRelease: false,
  }));
  if (releaseDay) {
    out.push({ id: 'release', title: 'Release', date: releaseDay, done: false, isRelease: true });
  }
  return out;
}

/**
 * Dates for a plan with no release day yet (planner v2 writes undated tasks
 * that carry only an offset). Open key tasks, soonest first, then a
 * "Pick a day" row for release day. Null when no task carries an offset.
 */
function deriveUndatedBriefDates(tasks: BriefTaskRow[]): BriefDateRow[] | null {
  const entries = tasks
    .filter((task) => String(task.status || '') !== 'cancelled')
    .map((task) => ({ task, meta: readUndatedTaskMeta(task.metadata) }))
    .filter((entry): entry is { task: BriefTaskRow; meta: NonNullable<ReturnType<typeof readUndatedTaskMeta>> } => entry.meta !== null);
  if (entries.length === 0) return null;
  const key = entries.filter(
    (entry) => isMilestoneMetadata(entry.task.metadata) || readPlanKey(entry.task.metadata) === true
  );
  const pool = (key.length > 0 ? key : entries).filter((entry) => String(entry.task.status || '') !== 'done');
  pool.sort(
    (a, b) =>
      (a.meta.now === b.meta.now ? 0 : a.meta.now ? -1 : 1) ||
      a.meta.offset_days - b.meta.offset_days ||
      (a.task.position ?? 0) - (b.task.position ?? 0)
  );
  const rows: BriefDateRow[] = pool.slice(0, MAX_DATE_ROWS - 1).map((entry) => ({
    id: entry.task.id,
    title: (entry.task.title || '').trim() || 'Untitled',
    date: '',
    done: false,
    isRelease: false,
    when: relativeWhenLabel(entry.meta.offset_days, entry.meta.now),
  }));
  rows.push({ id: 'release', title: 'Release', date: '', done: false, isRelease: true, when: 'Pick a day' });
  return rows;
}

export type BriefProfile = { id: string; name: string | null; email: string | null };

/**
 * Who's on what. Read-only, from task assignees: each person with open work on
 * the rollout, their next open task (soonest date, undated last), and how many
 * they have open. Busiest first.
 */
export function deriveBriefPeople(input: {
  tasks: BriefTaskRow[];
  profiles: BriefProfile[];
}): BriefPerson[] {
  const byId = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const groups = new Map<string, BriefTaskRow[]>();
  for (const task of input.tasks) {
    const assignee = task.assigned_to_user_id;
    if (!assignee || isTaskClosed(task.status)) continue;
    const list = groups.get(assignee) ?? [];
    list.push(task);
    groups.set(assignee, list);
  }

  const people: BriefPerson[] = [];
  for (const [userId, tasks] of groups) {
    const profile = byId.get(userId);
    const sorted = [...tasks].sort((a, b) => {
      const dayA = lagosDay(a.due_date) ?? '9999-12-31';
      const dayB = lagosDay(b.due_date) ?? '9999-12-31';
      return dayA.localeCompare(dayB) || (a.position ?? 0) - (b.position ?? 0);
    });
    people.push({
      key: userId,
      name: firstName(profile?.name, profile?.email),
      initials: initialsFor(profile?.name, profile?.email),
      nextTask: (sorted[0]?.title || '').trim() || null,
      openCount: tasks.length,
    });
  }
  return people.sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name));
}

// ── History ──────────────────────────────────────────────────────────────────

/**
 * Which revision ids to delete so only the newest {@link MAX_REVISIONS} stay.
 * Ties on time keep the later id, so the answer never depends on read order.
 */
export function revisionsToTrim(
  rows: { id: string; created_at: string }[],
  keep: number = MAX_REVISIONS
): string[] {
  const sorted = [...rows].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  );
  return sorted.slice(Math.max(0, keep)).map((row) => row.id);
}

// ── View link token ──────────────────────────────────────────────────────────

const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SHARE_TOKEN_LENGTH = 24;

/**
 * An unguessable view-link token: 24 characters from a 56-letter alphabet
 * (about 139 bits), with no look-alike letters so a token read aloud survives.
 * `randomBytes` is injected so the test can pin it; the server passes
 * crypto.getRandomValues.
 */
export function generateShareToken(
  randomBytes: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length))
): string {
  const bytes = randomBytes(SHARE_TOKEN_LENGTH * 2);
  let token = '';
  // Rejection sampling: 56 does not divide 256, so bytes >= 224 are skipped
  // rather than wrapped, keeping every letter equally likely.
  for (let i = 0; i < bytes.length && token.length < SHARE_TOKEN_LENGTH; i += 1) {
    const byte = bytes[i];
    if (byte >= 224) continue;
    token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
  }
  while (token.length < SHARE_TOKEN_LENGTH) {
    token += TOKEN_ALPHABET[randomBytes(1)[0] % TOKEN_ALPHABET.length];
  }
  return token;
}

export function isPlausibleShareToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9]{16,64}$/.test(token);
}

// ── Formatting ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 16 Oct" for a YYYY-MM-DD day. */
export function formatBriefDay(day: string | null | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "14 Oct" for a timestamp, in Lagos time. */
export function formatShortDay(value: string | null | undefined): string {
  const day = lagosDay(value);
  if (!day) return '';
  const date = new Date(`${day}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * History's right-hand column, as the mock reads it: "now", "5m", "2h",
 * "Yesterday", a weekday within the week, then "12 Oct".
 */
export function formatHistoryTime(value: string, now: Date = new Date()): string {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return '';
  const diff = Math.max(0, now.getTime() - ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const today = lagosDay(now.toISOString());
  const then = lagosDay(value);
  if (hours < 24 && then === today) return `${hours}h`;
  if (!today || !then) return formatShortDay(value);
  const dayGap = Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${then}T00:00:00Z`).getTime()) / 86_400_000
  );
  if (dayGap <= 0) return `${hours}h`;
  if (dayGap === 1) return 'Yesterday';
  if (dayGap < 7) return WEEKDAYS[new Date(`${then}T00:00:00Z`).getUTCDay()];
  return formatShortDay(value);
}

/** "2h ago" style, for the header's "Edited by Kemi · 2h ago". */
export function formatEditedAgo(value: string | null, now: Date = new Date()): string {
  if (!value) return '';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.floor(Math.max(0, now.getTime() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return formatShortDay(value);
}

// ── From the plan ────────────────────────────────────────────────────────────

/**
 * The Idea and suggested decisions an approved planner-v2 plan already holds
 * (its `built_for`, budget and picked channels). Pure and lenient: the plan
 * document is stored JSON, so every field is checked. Null when it offers
 * nothing, so the brief shows its normal empty state.
 */
export function buildBriefPlanSeed(planV2: unknown, spokenIdeas: string[] = []): BriefPlanSeed | null {
  const root = planV2 && typeof planV2 === 'object' ? (planV2 as Record<string, unknown>) : {};
  const builtFor = root.built_for && typeof root.built_for === 'object' ? (root.built_for as Record<string, unknown>) : {};
  const str = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  const summary = str(builtFor.summary);
  const win = str(builtFor.win);
  const constraints = Array.isArray(builtFor.constraints) ? builtFor.constraints.map(str).filter(Boolean) : [];

  // What the team said or typed on the idea card leads; the plan follows it.
  const spoken = spokenIdeas.map((note) => note.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  const idea = [
    spoken,
    summary,
    win ? `Goal: ${win.replace(/[.]+$/, '')}.` : '',
    constraints.length > 0 ? `Keep in mind: ${constraints.slice(0, 3).join('; ').replace(/[.]+$/, '')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_IDEA_LENGTH);

  const decisions: string[] = [];
  if (win) decisions.push(`Win: ${win}`.slice(0, MAX_DECISION_LENGTH));
  const budget = root.budget && typeof root.budget === 'object' ? (root.budget as Record<string, unknown>) : null;
  if (budget && typeof budget.total_naira === 'number' && Number.isFinite(budget.total_naira)) {
    decisions.push(
      budget.total_naira <= 0
        ? 'Promo spend: ₦0, free channels only'
        : `Promo spend: up to ₦${Math.round(budget.total_naira).toLocaleString('en-NG')}`
    );
  }
  const answers = root.answers && typeof root.answers === 'object' ? (root.answers as Record<string, unknown>) : null;
  const channels = Array.isArray(answers?.channels)
    ? (answers.channels as unknown[]).filter((c): c is string => typeof c === 'string').map((c) => channelLabel(c as Channel))
    : [];
  if (channels.length > 0) decisions.push(`Channels: ${channels.join(', ')}`.slice(0, MAX_DECISION_LENGTH));

  if (!idea && decisions.length === 0) return null;
  return { idea, decisions };
}

// ── UrgAns draft prompt ─────────────────────────────────────────────────────

export type BriefDraftContext = {
  title: string;
  artistName: string;
  releaseType: string;
  releaseDate: string | null;
  genre: string;
  description: string;
  taskTitles: string[];
  /** The approved plan's own summary and goal, when there is one. */
  planNotes?: string;
};

export function buildBriefDraftMessages(context: BriefDraftContext): { role: 'system' | 'user'; content: string }[] {
  const facts = [
    `Title: ${context.title || 'Untitled'}`,
    context.artistName ? `Artist: ${context.artistName}` : '',
    context.releaseType ? `Format: ${context.releaseType}` : '',
    context.releaseDate ? `Release day: ${formatBriefDay(lagosDay(context.releaseDate))}` : '',
    context.genre ? `Genre: ${context.genre}` : '',
    context.description ? `What the team wrote about it: ${context.description}` : '',
    context.planNotes ? `What the plan was built for: ${context.planNotes}` : '',
    context.taskTitles.length > 0 ? `Some of the plan: ${context.taskTitles.slice(0, 15).join('; ')}` : '',
  ].filter(Boolean);

  return [
    {
      role: 'system',
      content:
        'You write the Idea paragraph of a music release brief: the internal creative direction a team reads before they work. ' +
        'Write 2 or 3 short sentences in plain, warm English: what the song is, how it should feel, and one line on how the rollout should carry that feel. ' +
        'Use only the facts given. Never invent names, places, numbers, features or quotes. No hashtags, no emojis, no markdown, no lists, no headings.',
    },
    { role: 'user', content: facts.join('\n') },
  ];
}

/** The model's text as a clean paragraph, or null if nothing usable came back. */
export function cleanBriefDraft(raw: string): string | null {
  const text = raw
    .replace(/^```[a-z]*\s*|```$/gi, '')
    .replace(/\*\*|__|^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(idea|brief)\s*:\s*/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
  if (!text) return null;
  return text.slice(0, MAX_IDEA_LENGTH);
}
