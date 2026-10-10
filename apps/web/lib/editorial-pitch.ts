// The Spotify editorial pitch, as a plan step the team can run to a deadline.
//
// Spotify only accepts a pitch after the distributor has delivered the release,
// and wants it at least 7 days before release day. So distribution has to be
// ordered early and the pitch has to follow it. Urganize owns the deadline;
// the team still submits in Spotify for Artists.
//
// Pure module: no IO, safe in the browser. The reads and writes that act on
// these rules live in lib/editorial-pitch-server.ts.
//
// Day maths is on Lagos calendar days (the same rule as lib/presence.ts), so
// the browser banner and the daily sweep agree on what "today" is.

import { presenceDay } from './presence';
import { dayNumber, formatDay } from './lagos-day';

// ---------------------------------------------------------------------------
// The plan step
// ---------------------------------------------------------------------------

/** The playbook step id, the same in every playbook. */
export const EDITORIAL_PITCH_TASK_ID = 'editorial_pitch';

/** Days before release day the pitch is due. */
export const EDITORIAL_PITCH_OFFSET_DAYS = -28;

/** Spotify takes no pitch inside this many days of release day. */
export const PITCH_WINDOW_CLOSES_DAYS = 7;

/** Spotify wants delivery at least this far out; the order may sit earlier. */
export const DISTRIBUTION_ORDER_LATEST_OFFSET_DAYS = -35;

/**
 * The upload-to-distributor step in each playbook: the one the pitch waits on.
 * Single stays at -42 and album at -49 (earlier delivery gives Spotify more
 * time); EP is at -35. Never later than -35.
 */
export const DISTRIBUTION_ORDER_TASK_ID_BY_TEMPLATE: Readonly<Record<string, string>> = {
  'single_v0.3': 'w6_upload_to_distributor',
  'ep_v0.1': 'w5_upload_ep_to_distributor',
  'album_v0.1': 'w7_upload_album_to_distributor',
};

export const DISTRIBUTION_ORDER_TASK_IDS: readonly string[] = Object.values(
  DISTRIBUTION_ORDER_TASK_ID_BY_TEMPLATE
);

/**
 * The pitch steps this one replaced. A plan built before the change still holds
 * them; opening such a rollout converts an open one in place.
 */
export const LEGACY_PITCH_TASK_IDS: readonly string[] = [
  'w6_spotify_for_artists_pitch',
  'w5_ep_editorial_pitch',
  'w5_album_editorial_pitch',
];

/** Steps that stay with the release owner by default, whatever past releases say. */
export const OWNER_DEFAULT_TASK_IDS: readonly string[] = [
  EDITORIAL_PITCH_TASK_ID,
  ...DISTRIBUTION_ORDER_TASK_IDS,
];

/** Steps the planner's model may not move: both are pinned to Spotify's rules. */
export const PINNED_OFFSET_TASK_IDS: readonly string[] = OWNER_DEFAULT_TASK_IDS;

export function isPinnedOffsetTask(templateTaskId: string | null | undefined): boolean {
  return Boolean(templateTaskId) && PINNED_OFFSET_TASK_IDS.includes(templateTaskId as string);
}

export function isOwnerDefaultTask(templateTaskId: string | null | undefined): boolean {
  return Boolean(templateTaskId) && OWNER_DEFAULT_TASK_IDS.includes(templateTaskId as string);
}

export function isEditorialPitchTask(templateTaskId: string | null | undefined): boolean {
  return templateTaskId === EDITORIAL_PITCH_TASK_ID;
}

export function isLegacyPitchTask(templateTaskId: string | null | undefined): boolean {
  return Boolean(templateTaskId) && LEGACY_PITCH_TASK_IDS.includes(templateTaskId as string);
}

export function isDistributionOrderTask(templateTaskId: string | null | undefined): boolean {
  return Boolean(templateTaskId) && DISTRIBUTION_ORDER_TASK_IDS.includes(templateTaskId as string);
}

// ---------------------------------------------------------------------------
// Copy (the briefs' text is final; see the README)
// ---------------------------------------------------------------------------

export const EDITORIAL_PITCH_TITLE = 'Pitch to Spotify editorial';
export const EDITORIAL_PITCH_DESCRIPTION =
  'Spotify needs this at least 7 days before release day. Earlier gives you a better shot.';
export const PITCH_BLOCKED_COPY =
  "Order distribution first. Spotify can't see the release until then.";
export const PITCH_CLOSED_COPY = 'The Spotify pitch window has closed.';
export const PITCH_MOVE_DATE_LABEL = 'Move release date';
export const PITCH_SKIP_LABEL = 'Release without a pitch';
export const PITCH_DRAFT_LABEL = 'Draft my pitch';
export const PITCH_COPY_LABEL = 'Copy';

/** Where a manager submits the pitch. Urganize never submits it for them. */
export const SPOTIFY_FOR_ARTISTS_URL = 'https://artists.spotify.com';
export const SPOTIFY_FOR_ARTISTS_LABEL = 'Open Spotify for Artists';
export const SPOTIFY_PITCH_STEPS =
  'In Spotify for Artists, open Music, then Upcoming. Pick the song from this rollout and choose Pitch a song. Paste each field from here.';

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function pitchCounterCopy(length: number): string {
  return `${length}/${PITCH_DESCRIPTION_MAX}`;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

/**
 * Calendar days from today (Lagos) to release day, or null with no usable date.
 * Positive while release day is ahead, 0 on the day, negative after.
 */
export function daysToRelease(
  releaseDate: string | null | undefined,
  now: Date
): number | null {
  const release = dayNumber(releaseDate);
  const today = dayNumber(presenceDay(now));
  if (release === null || today === null) return null;
  return release - today;
}

export type PitchWindowState =
  /** More than 7 days out: Spotify still takes a pitch. */
  | 'open'
  /** 7 days or fewer, release day not yet passed: the window has closed. */
  | 'closed'
  /** Release day has passed: nothing left to decide. */
  | 'past'
  /** No usable release date. */
  | 'unknown';

export function pitchWindowState(days: number | null): PitchWindowState {
  if (days === null) return 'unknown';
  if (days < 0) return 'past';
  if (days <= PITCH_WINDOW_CLOSES_DAYS) return 'closed';
  return 'open';
}

/** Whole days left before the window closes (never negative). */
export function daysUntilWindowCloses(days: number): number {
  return Math.max(0, days - PITCH_WINDOW_CLOSES_DAYS);
}

/**
 * The due date for a pitch added to an existing rollout: the later of
 * (release day minus 28) and today, as the same UTC-midnight ISO timestamp the
 * template rows carry. Null when there is no usable release date.
 */
export function pitchDueDate(releaseDate: string | null | undefined, now: Date): string | null {
  const release = dayNumber(releaseDate);
  const today = dayNumber(presenceDay(now));
  if (release === null || today === null) return null;
  const due = Math.max(release + EDITORIAL_PITCH_OFFSET_DAYS, today);
  return `${formatDay(due)}T00:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const PITCH_REMINDER_TIERS = [28, 14, 8] as const;
export type PitchReminderTier = (typeof PITCH_REMINDER_TIERS)[number];

/**
 * Which reminder applies on a given day, or null for none. Windows rather than
 * exact days, so a missed cron day does not lose the reminder:
 *   15 to 28 days out -> 28, 9 to 14 -> 14, 8 -> 8.
 * Seven days or fewer is the closed window, where the banner takes over.
 */
export function reminderTierFor(days: number | null): PitchReminderTier | null {
  if (days === null) return null;
  if (days <= PITCH_WINDOW_CLOSES_DAYS) return null;
  if (days <= 8) return 8;
  if (days <= 14) return 14;
  if (days <= 28) return 28;
  return null;
}

/**
 * "Your Spotify pitch for {release} is due in {n} days." Counted to the day the
 * window closes (7 days before release day), so a reminder at 28 days out
 * says 21.
 */
export function pitchReminderCopy(days: number, releaseTitle: string): string {
  const left = daysUntilWindowCloses(days);
  const title = releaseTitle.trim() || 'your rollout';
  return `Your Spotify pitch for ${title} is due in ${left} ${plural(left, 'day', 'days')}.`;
}

/** The notification types the sweep writes, one per reminder. */
export const PITCH_REMINDER_NOTIFICATION_TYPES = [
  'pitch_reminder_28d',
  'pitch_reminder_14d',
  'pitch_reminder_8d',
] as const;

export function isPitchReminderType(type: string): boolean {
  return (PITCH_REMINDER_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** The tier a reminder type stands for, or null for any other type. */
export function pitchTierForType(type: string): PitchReminderTier | null {
  switch (type) {
    case 'pitch_reminder_28d':
      return 28;
    case 'pitch_reminder_14d':
      return 14;
    case 'pitch_reminder_8d':
      return 8;
    default:
      return null;
  }
}

/**
 * The bell's line for a reminder. Counted from today when the release date is
 * known, so a reminder read three days later says three days less; the
 * nominal tier is the fallback. Once the window has closed it says so instead.
 */
export function pitchNotificationMessage(
  type: string,
  release: { title?: string | null; date?: string | null },
  now: Date
): string {
  const tier = pitchTierForType(type);
  const days = daysToRelease(release.date, now);
  if (days !== null && pitchWindowState(days) !== 'open') return PITCH_CLOSED_COPY;
  const counted = days ?? tier ?? 28;
  return pitchReminderCopy(counted, release.title ?? '');
}

// ---------------------------------------------------------------------------
// The once-only backfill
// ---------------------------------------------------------------------------

export type BackfillOutcome =
  /** The task was added. */
  | 'added'
  /** An open pitch task from the old playbook was rewritten in place. */
  | 'converted'
  /** The plan already carries the new task. */
  | 'present'
  /** The old pitch was already done; nothing to add. */
  | 'already_pitched'
  /** Release day is 7 days away or less. */
  | 'too_late';

export type BackfillInput = {
  daysToRelease: number | null;
  /** A task with template step id editorial_pitch exists, in any status. */
  hasPitchTask: boolean;
  /** An old-playbook pitch task exists and is still open. */
  hasOpenLegacyPitch: boolean;
  /** An old-playbook pitch task exists and is done. */
  hasDoneLegacyPitch: boolean;
};

/**
 * What to do the first time an older rollout is opened. Returns null to leave
 * the rollout alone WITHOUT recording a decision (no usable date), because a
 * date set later should still get the task.
 */
export function decideBackfill(input: BackfillInput): BackfillOutcome | null {
  if (input.hasPitchTask) return 'present';
  if (input.daysToRelease === null) return null;
  if (pitchWindowState(input.daysToRelease) !== 'open') return 'too_late';
  if (input.hasDoneLegacyPitch) return 'already_pitched';
  if (input.hasOpenLegacyPitch) return 'converted';
  return 'added';
}

// ---------------------------------------------------------------------------
// The pitch fields
// ---------------------------------------------------------------------------

/** Spotify's hard limit on the song description. */
export const PITCH_DESCRIPTION_MAX = 500;
const FIELD_MAX = 200;

export type PitchFields = {
  genre: string;
  moods: string;
  instruments: string;
  description: string;
};

export const EMPTY_PITCH_FIELDS: PitchFields = {
  genre: '',
  moods: '',
  instruments: '',
  description: '',
};

export const PITCH_FIELD_KEYS = ['genre', 'moods', 'instruments', 'description'] as const;
export type PitchFieldKey = (typeof PITCH_FIELD_KEYS)[number];

export const PITCH_FIELD_LABELS: Record<PitchFieldKey, string> = {
  genre: 'Genre',
  moods: 'Moods',
  instruments: 'Instruments',
  description: 'Song description',
};

/** Cut text to a limit at a word boundary, never mid-word, never over the limit. */
export function clampAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Keep the whole cut when there is no space to fall back on (one long word).
  const trimmed = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return trimmed.replace(/[\s,;:.\-]+$/, '').trim();
}

function cleanField(value: unknown, max: number): string {
  if (Array.isArray(value)) {
    return clampAtWord(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(', '),
      max
    );
  }
  return typeof value === 'string' ? clampAtWord(value, max) : '';
}

/** Read stored fields back, tolerating anything: unknown input gives empty fields. */
export function parsePitchFields(raw: unknown): PitchFields {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PITCH_FIELDS };
  const record = raw as Record<string, unknown>;
  return {
    genre: cleanField(record.genre, FIELD_MAX),
    moods: cleanField(record.moods, FIELD_MAX),
    instruments: cleanField(record.instruments, FIELD_MAX),
    description: cleanField(record.description, PITCH_DESCRIPTION_MAX),
  };
}

/**
 * What a person typed or saved, validated for a write. Unlike
 * {@link parsePitchFields} this refuses an over-long description rather than
 * cutting it: silently shortening somebody's own words is the wrong default.
 */
export function validatePitchFieldsInput(
  raw: unknown
): { ok: true; fields: PitchFields } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Send the pitch fields as an object.' };
  const record = raw as Record<string, unknown>;
  const out: PitchFields = { ...EMPTY_PITCH_FIELDS };
  for (const key of PITCH_FIELD_KEYS) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return { ok: false, error: `${PITCH_FIELD_LABELS[key]} must be text.` };
    const max = key === 'description' ? PITCH_DESCRIPTION_MAX : FIELD_MAX;
    const clean = value.replace(/\r\n/g, '\n').trim();
    if (clean.length > max) {
      return { ok: false, error: `${PITCH_FIELD_LABELS[key]} is over ${max} characters.` };
    }
    out[key] = clean;
  }
  return { ok: true, fields: out };
}

/** Read a model's draft. Anything unusable gives empty fields; the description is clamped. */
export function parsePitchDraft(raw: unknown): PitchFields {
  return parsePitchFields(raw);
}

/**
 * Fold a draft into what is already there: only empty fields are filled.
 * Whatever a person already typed is never overwritten.
 */
export function mergeDraftIntoEmpty(existing: PitchFields, draft: PitchFields): PitchFields {
  const next = { ...existing };
  for (const key of PITCH_FIELD_KEYS) {
    if (!existing[key].trim() && draft[key].trim()) next[key] = draft[key];
  }
  return next;
}

/** True when every field already has text, so a draft would change nothing. */
export function allPitchFieldsFilled(fields: PitchFields): boolean {
  return PITCH_FIELD_KEYS.every((key) => fields[key].trim().length > 0);
}
