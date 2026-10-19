/**
 * The handoff to the distributor (URG-322, 2026-10-16): the three things a
 * distributor needs (the final master, the cover art and the metadata), each
 * with one owner, one due date and one status, so a release does not slip on
 * late files.
 *
 * WHERE EACH PART LIVES. No new table:
 *   - lead time   releases.metadata.handoff_lead_days (7, 14, 21 or 28; 14 when unset)
 *   - approvals   releases.metadata.handoff[item] = { approvedAt, approvedBy, approvedFor, ... }
 *   - sent        the item's own task (tasks.metadata.handoff_item): done means sent,
 *                 so ticking it off in the activity list and Mark sent are the same act,
 *                 and reopening it there is un-sending. A rollout with no plan yet has
 *                 no tasks (an empty rollout is how the app offers the planner), so
 *                 until then the sentAt in the record stands in for the task
 *   - dropped     the item's task is cancelled (URG-399 follow-up, Oyin Oct 19, 2026):
 *                 the team dropped that send, so it is neither sent nor owed. It
 *                 leaves both "N of M sent" numbers, is never late, offers no action,
 *                 and a handoff whose every row is dropped shows no chip
 *   - owner       the task's assignee, so the ordinary 7d / 3d / due / overdue
 *                 reminders reach them (notifications hang off tasks)
 *   - uploaded    NEVER stored. Derived from the check before distribution
 *                 (lib/distribution-rules.ts), so a file that breaks after it was
 *                 approved or sent reads Missing again.
 *
 * THE MASTER IS NOT IN URGANIZE. Song upload was removed everywhere (Oct 17,
 * 2026): the team sends the master to the distributor from their own files, so
 * the master row is never Missing. It starts ready to approve, and Mark sent is
 * the team saying it went.
 *
 * AN APPROVAL IS FOR ONE FILE. It records which upload it approved (the asset
 * id), so replacing the artwork asks for a fresh look rather than carrying an
 * approval across to a file nobody has seen.
 *
 * DATES ARE CALENDAR DAYS ("YYYY-MM-DD"), never instants: a release day is a
 * day, and "2 days late" counts days on the person's own calendar.
 *
 * Pure: no React, no database. lib/handoff-server.ts does the reads and writes.
 */

import type { DistributionCheckResult, DistributionFieldPath, DistributionIssue } from './distribution-rules';

export const HANDOFF_ITEMS = ['master', 'cover_art', 'metadata'] as const;
export type HandoffItemKey = (typeof HANDOFF_ITEMS)[number];

/** The rows the Distribute handoff shows and keeps tasks for. The master row
 *  left Oct 17, 2026 (founder approved "cuts-3": files are cover art only):
 *  the master never lives in Urganize, so its row was only a hand-ticked
 *  "sent". `master` stays a key so stored records and old tasks still read;
 *  an old master task is left as an ordinary task, not deleted. */
export const SHOWN_HANDOFF_ITEMS = ['cover_art', 'metadata'] as const satisfies readonly HandoffItemKey[];

export const isHandoffItemKey = (value: unknown): value is HandoffItemKey =>
  typeof value === 'string' && (HANDOFF_ITEMS as readonly string[]).includes(value);

export const HANDOFF_ITEM_LABELS: Readonly<Record<HandoffItemKey, string>> = {
  master: 'Final master',
  cover_art: 'Cover art',
  metadata: 'Metadata',
};

/** The noun the owner sheet asks about: "Who sends the master?" */
export const HANDOFF_ITEM_NOUNS: Readonly<Record<HandoffItemKey, string>> = {
  master: 'the master',
  cover_art: 'the cover art',
  metadata: 'the metadata',
};

/** The title of the task that carries each item's owner, due date and reminders. */
export const HANDOFF_TASK_TITLES: Readonly<Record<HandoffItemKey, string>> = {
  master: 'Send the final master to the distributor',
  cover_art: 'Send the cover art to the distributor',
  metadata: 'Send the metadata to the distributor',
};

export const HANDOFF_TASK_DESCRIPTION =
  'Part of the handoff to the distributor on the Distribute step. Its due date follows the release date and the lead time set there.';

export const HANDOFF_LEAD_CHOICES = [7, 14, 21, 28] as const;
export type HandoffLeadDays = (typeof HANDOFF_LEAD_CHOICES)[number];
export const DEFAULT_HANDOFF_LEAD_DAYS: HandoffLeadDays = 14;

export const LEAD_DAYS_METADATA_KEY = 'handoff_lead_days';
export const HANDOFF_METADATA_KEY = 'handoff';
/** tasks.metadata key that tags a task as one handoff row's. */
export const HANDOFF_TASK_TAG = 'handoff_item';

export const isHandoffLeadDays = (value: unknown): value is HandoffLeadDays =>
  typeof value === 'number' && (HANDOFF_LEAD_CHOICES as readonly number[]).includes(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** The rollout's lead time, from releases.metadata. Anything unexpected is the default. */
export function readLeadDays(releaseMetadata: unknown): HandoffLeadDays {
  const raw = asRecord(releaseMetadata)[LEAD_DAYS_METADATA_KEY];
  return isHandoffLeadDays(raw) ? raw : DEFAULT_HANDOFF_LEAD_DAYS;
}

export type HandoffItemRecord = {
  ownerUserId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  /** What was approved: the asset id for a file, "metadata" for the fields. */
  approvedFor: string | null;
  sentAt: string | null;
  sentBy: string | null;
};

export const EMPTY_ITEM_RECORD: HandoffItemRecord = {
  ownerUserId: null,
  approvedAt: null,
  approvedBy: null,
  approvedFor: null,
  sentAt: null,
  sentBy: null,
};

export type HandoffRecord = Record<HandoffItemKey, HandoffItemRecord>;

/** releases.metadata.handoff, read defensively: a missing or odd value is empty. */
export function readHandoffRecord(releaseMetadata: unknown): HandoffRecord {
  const stored = asRecord(asRecord(releaseMetadata)[HANDOFF_METADATA_KEY]);
  const read = (key: HandoffItemKey): HandoffItemRecord => {
    const item = asRecord(stored[key]);
    return {
      ownerUserId: asText(item.ownerUserId),
      approvedAt: asText(item.approvedAt),
      approvedBy: asText(item.approvedBy),
      approvedFor: asText(item.approvedFor),
      sentAt: asText(item.sentAt),
      sentBy: asText(item.sentBy),
    };
  };
  return { master: read('master'), cover_art: read('cover_art'), metadata: read('metadata') };
}

/** releases.metadata with one item's record replaced. Everything else is kept. */
export function withItemRecord(
  releaseMetadata: unknown,
  item: HandoffItemKey,
  patch: Partial<HandoffItemRecord>
): Record<string, unknown> {
  const metadata = asRecord(releaseMetadata);
  const current = readHandoffRecord(metadata);
  const next = { ...current, [item]: { ...current[item], ...patch } };
  return { ...metadata, [HANDOFF_METADATA_KEY]: next };
}

// ---------------------------------------------------------------------------
// Calendar days
// ---------------------------------------------------------------------------

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** Midnight UTC of a calendar day, or null. Accepts "2026-10-30" or a timestamp. */
export function ymdToUtcMs(value: string | null | undefined): number | null {
  const match = YMD.exec(String(value ?? '').trim());
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? ms : null;
}

const MS_PER_DAY = 86_400_000;

const msToYmd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The day the files are due: release day minus the lead time. Null with no release day. */
export function handoffDueDate(releaseDate: string | null | undefined, leadDays: number): string | null {
  const release = ymdToUtcMs(releaseDate);
  if (release === null) return null;
  return msToYmd(release - leadDays * MS_PER_DAY);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function calendarDaysBetween(from: string, to: string): number | null {
  const a = ymdToUtcMs(from);
  const b = ymdToUtcMs(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

/** How many days past due on `today`, or 0 when not late (due today is not late). */
export function daysLate(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  const days = calendarDaysBetween(dueDate, today);
  return days !== null && days > 0 ? days : 0;
}

/** The person's own calendar day, as YYYY-MM-DD. */
export function localYmd(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "Fri 30 Oct". */
export function formatHandoffDay(ymd: string | null | undefined): string {
  const ms = ymdToUtcMs(ymd);
  if (ms === null) return '';
  const date = new Date(ms);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(date);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(date);
  return `${weekday} ${day} ${month}`;
}

/** "1 day late", "2 days late". */
export const formatDaysLate = (days: number): string => `${days} ${days === 1 ? 'day' : 'days'} late`;

// ---------------------------------------------------------------------------
// Uploaded: derived from the check before distribution
// ---------------------------------------------------------------------------

const isArtworkCode = (code: string) => code.startsWith('artwork_');

/** The errors that hold the metadata row back: the fields a distributor reads.
 *  The release day is not one of them (no release day is its own state). */
const METADATA_FIELD_PATHS = new Set<DistributionFieldPath>([
  'title',
  'artist',
  'metadata.genre',
  'metadata.language',
  'metadata.explicit',
  'metadata.featured_artists',
  'credits',
  'credits.splits',
]);

export function itemErrors(item: HandoffItemKey, check: DistributionCheckResult): DistributionIssue[] {
  return check.errors.filter((issue) => {
    if (item === 'master') return false;
    if (item === 'cover_art') return isArtworkCode(issue.code);
    return METADATA_FIELD_PATHS.has(issue.fieldPath);
  });
}

export type UploadFacts = {
  hasArtwork: boolean;
  lyrics: string | null;
};

/** Whether an item is in the app and good enough for a store. Never ticked by
 *  hand. The master is never in the app, so it is always ready to approve. */
export function isUploaded(item: HandoffItemKey, check: DistributionCheckResult, facts: UploadFacts): boolean {
  const errors = itemErrors(item, check);
  if (item === 'master') return true;
  if (item === 'cover_art') return facts.hasArtwork && errors.length === 0;
  return errors.length === 0 && Boolean(facts.lyrics && facts.lyrics.trim());
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type HandoffStatus = 'missing' | 'uploaded' | 'approved' | 'sent' | 'dropped';

/** A cancelled send task means the team dropped that send (Oyin, Oct 19, 2026). */
export const isDroppedStatus = (status: HandoffStatus): boolean => status === 'dropped';

export type HandoffTaskState = {
  id: string;
  status: string;
  assignedToUserId: string | null;
  dueDate: string | null;
  completedAt: string | null;
};

/**
 * Missing → Uploaded → Approved → Sent. A broken file or field is Missing
 * whatever was ticked before; an approval counts only for the upload it was
 * given to (`fingerprint`); sent is the item's task being done.
 */
export function deriveHandoffStatus(input: {
  uploaded: boolean;
  record: HandoffItemRecord;
  fingerprint: string | null;
  task: Pick<HandoffTaskState, 'status'> | null;
  /** Marked sent before the rollout had a plan, so before there was a task. */
  sentWithoutTask?: boolean;
}): HandoffStatus {
  // Dropped first: a cancelled send is not owed, whatever state its file is in.
  if (input.task?.status === 'cancelled') return 'dropped';
  if (!input.uploaded) return 'missing';
  if (input.task ? input.task.status === 'done' : input.sentWithoutTask) return 'sent';
  if (input.record.approvedAt && input.record.approvedFor && input.record.approvedFor === input.fingerprint) {
    return 'approved';
  }
  return 'uploaded';
}

/** The one action a row offers. Missing opens the step that holds the thing. */
export type HandoffRowAction = 'fix' | 'approve' | 'send' | null;

export function rowActionFor(status: HandoffStatus): HandoffRowAction {
  if (status === 'missing') return 'fix';
  if (status === 'uploaded') return 'approve';
  if (status === 'approved') return 'send';
  // Sent and dropped offer nothing: a dropped send is the team's call, undone on the task.
  return null;
}

/** The button's words. Files are uploaded; fields are fixed. */
export function rowActionLabel(item: HandoffItemKey, action: HandoffRowAction): string | null {
  if (action === 'fix') return 'Upload';
  if (action === 'approve') return 'Approve';
  if (action === 'send') return 'Mark sent';
  return null;
}

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

export type HandoffHeader =
  | { kind: 'no_date' }
  | { kind: 'all_dropped' }
  | { kind: 'all_sent'; sentOn: string | null }
  | { kind: 'late'; days: number; dueDate: string }
  | { kind: 'due'; dueDate: string };

export function handoffHeader(input: {
  dueDate: string | null;
  today: string;
  statuses: readonly HandoffStatus[];
  sentDates: readonly (string | null)[];
}): HandoffHeader {
  // Dropped sends are out of the count: neither sent nor owed.
  const active = input.statuses.filter((status) => !isDroppedStatus(status));
  if (input.statuses.length > 0 && active.length === 0) return { kind: 'all_dropped' };
  if (active.length > 0 && active.every((status) => status === 'sent')) {
    const dates = input.sentDates.filter((value): value is string => Boolean(value)).sort();
    return { kind: 'all_sent', sentOn: dates.length ? dates[dates.length - 1].slice(0, 10) : null };
  }
  if (!input.dueDate) return { kind: 'no_date' };
  const late = daysLate(input.dueDate, input.today);
  return late > 0 ? { kind: 'late', days: late, dueDate: input.dueDate } : { kind: 'due', dueDate: input.dueDate };
}

export const sentCount = (statuses: readonly HandoffStatus[]): number =>
  statuses.filter((status) => status === 'sent').length;

/** The rows that still count: every row but the dropped ones. The "M" in "N of M sent". */
export const activeCount = (statuses: readonly HandoffStatus[]): number =>
  statuses.filter((status) => !isDroppedStatus(status)).length;

/** Whether one row reads late on `today`: owed (not sent, not dropped) past the due day. */
export const isRowLate = (status: HandoffStatus, dueDate: string | null, today: string): boolean =>
  status !== 'sent' && !isDroppedStatus(status) && daysLate(dueDate, today) > 0;

export type HandoffChipSummary = {
  sent: number;
  total: number;
  allSent: boolean;
  /** Days late, 0 when nothing owed is late. */
  late: number;
  /** "Handoff · 1 of 2 sent · 3 days late" without the "Handoff". */
  summary: string;
};

/**
 * What the rollout line's chip says, or null when there is nothing to show:
 * every send dropped (Oyin, Oct 19, 2026), so no "0 of 0", or no rows at all.
 * Dropped sends are out of both numbers and never make it late.
 */
export function handoffChipSummary(
  statuses: readonly HandoffStatus[],
  dueDate: string | null,
  today: string,
  formatDay: (ymd: string) => string = formatHandoffDay
): HandoffChipSummary | null {
  const total = activeCount(statuses);
  if (total === 0) return null;
  const sent = sentCount(statuses);
  const allSent = sent === total;
  const late = !allSent && dueDate ? daysLate(dueDate, today) : 0;
  const tail = allSent ? null : late > 0 ? formatDaysLate(late) : dueDate ? `due ${formatDay(dueDate)}` : null;
  return { sent, total, allSent, late, summary: [`${sent} of ${total} sent`, tail].filter(Boolean).join(' · ') };
}

// ---------------------------------------------------------------------------
// Keeping the three tasks in step
// ---------------------------------------------------------------------------

export type HandoffTaskOp =
  | {
      kind: 'insert';
      item: HandoffItemKey;
      dueDate: string;
      assigneeUserId: string;
      /** Marked sent before the task existed: it starts done. */
      done: boolean;
    }
  | {
      kind: 'update';
      item: HandoffItemKey;
      taskId: string;
      patch: { due_date?: string | null; status?: 'todo'; completed_at?: null };
    };

/** The timestamp a task's due_date is stored as for a calendar day: midnight
 *  UTC, the same as every plan task built from a template. */
export const dueDateToTimestamp = (ymd: string): string => `${ymd}T00:00:00.000Z`;

/**
 * What to write so each row's task matches the row. Pure, so the decisions are
 * tested rather than hoped for:
 *   - no task and a due date: make one, assigned to the row's owner
 *   - the due date moved (lead time or release day changed): move the task
 *   - the release day was taken away: the task loses its date (reminders stop)
 *   - a task marked done whose file or field has since broken: reopen it, so
 *     the reminders start again and the row reads Missing
 * Nothing else is touched: a reassignment or a cancel made on the task itself
 * is the team's call.
 */
export function planHandoffTaskSync(input: {
  dueDate: string | null;
  items: ReadonlyArray<{
    item: HandoffItemKey;
    uploaded: boolean;
    /** The record says it was sent before there was a task. */
    sentBeforeTask?: boolean;
    ownerUserId: string;
    task: HandoffTaskState | null;
  }>;
}): HandoffTaskOp[] {
  const ops: HandoffTaskOp[] = [];
  for (const row of input.items) {
    if (!row.task) {
      if (input.dueDate) {
        ops.push({
          kind: 'insert',
          item: row.item,
          dueDate: input.dueDate,
          assigneeUserId: row.ownerUserId,
          done: Boolean(row.sentBeforeTask) && row.uploaded,
        });
      }
      continue;
    }
    const patch: { due_date?: string | null; status?: 'todo'; completed_at?: null } = {};
    const currentDay = row.task.dueDate ? row.task.dueDate.slice(0, 10) : null;
    if (input.dueDate && currentDay !== input.dueDate) patch.due_date = dueDateToTimestamp(input.dueDate);
    if (!input.dueDate && currentDay !== null) patch.due_date = null;
    if (row.task.status === 'done' && !row.uploaded) {
      patch.status = 'todo';
      patch.completed_at = null;
    }
    if (Object.keys(patch).length > 0) ops.push({ kind: 'update', item: row.item, taskId: row.task.id, patch });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// The payload the Distribute step and the rollout line read
// ---------------------------------------------------------------------------

export type HandoffMember = {
  userId: string;
  name: string;
  initial: string;
  isYou: boolean;
};

export type HandoffMasterDetail = { kind: 'master' };
export type HandoffArtDetail = {
  kind: 'cover_art';
  width: number | null;
  height: number | null;
  format: string | null;
  /** The first artwork error, for the red line ("needs 3000"). */
  problem: string | null;
};
export type HandoffMetadataDetail = {
  kind: 'metadata';
  isrc: boolean;
  credits: boolean;
  /** 'ok', 'none' (nothing collected), or the off total as a number. */
  splits: 'ok' | 'none' | number;
  lyrics: boolean;
};

export type HandoffItemView = {
  key: HandoffItemKey;
  label: string;
  status: HandoffStatus;
  ownerUserId: string;
  sentAt: string | null;
  /** Whether the viewer may approve, mark sent and change the owner. */
  canAct: boolean;
  /** Where Missing's button goes: the first error's field, or 'lyrics'. */
  fix: { fieldPath: DistributionFieldPath } | { lyrics: true } | null;
  detail: HandoffMasterDetail | HandoffArtDetail | HandoffMetadataDetail;
};

export type HandoffPayload = {
  releaseDate: string | null;
  leadDays: HandoffLeadDays;
  dueDate: string | null;
  canEditLead: boolean;
  members: HandoffMember[];
  items: HandoffItemView[];
};

/** Who may act on a row: the rollout owner, or the person who owns the item. */
export const canActOnItem = (viewerId: string, releaseOwnerId: string, itemOwnerId: string): boolean =>
  Boolean(viewerId) && (viewerId === releaseOwnerId || viewerId === itemOwnerId);

/** The fix for a Missing row: the first error that holds it back, else lyrics. */
export function fixFor(
  item: HandoffItemKey,
  check: DistributionCheckResult,
  facts: UploadFacts
): HandoffItemView['fix'] {
  const first = itemErrors(item, check)[0];
  if (first) return { fieldPath: first.fieldPath };
  if (item === 'master') return null;
  if (item === 'cover_art') return { fieldPath: 'artwork' };
  return facts.lyrics && facts.lyrics.trim() ? null : { lyrics: true };
}
