import type { NotificationType, TaskNotification } from '@/lib/tasks';

/**
 * What the notification bell shows (2026-10-09, v1.92.7).
 *
 * Pure and client-safe: the bell imports it, the tests hold it. Two jobs.
 *
 * 1. The badge and the button's spoken name come from one function, so they
 *    cannot disagree. The list the bell holds is capped at 20 rows by the API,
 *    so a count past the badge's cap is "at least that many", never an exact
 *    figure. The badge says "9+", and the spoken name says "more than 9".
 * 2. The due-date sweep writes one notification per task, all within seconds of
 *    each other, so a team with a backlog saw a dropdown of near-identical
 *    "An activity is overdue" rows. A run of those is shown as one line that
 *    opens to the individual rows.
 */

/** More unread than this shows as "9+" on the 40px bell. */
export const BELL_BADGE_CAP = 9;

export type BellBadge = {
  visible: boolean;
  /** What is drawn on the bell. */
  label: string;
  /** What a screen reader says for the button. */
  ariaLabel: string;
};

export function bellBadge(unreadCount: number): BellBadge {
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) {
    return { visible: false, label: '', ariaLabel: 'Notifications' };
  }
  if (unreadCount > BELL_BADGE_CAP) {
    return {
      visible: true,
      label: `${BELL_BADGE_CAP}+`,
      ariaLabel: `Notifications, more than ${BELL_BADGE_CAP} unread`,
    };
  }
  return {
    visible: true,
    label: String(unreadCount),
    ariaLabel: `Notifications, ${unreadCount} unread`,
  };
}

/** The sweep's notification types. A sweep writes one row per task. */
export const DIGEST_NOTIFICATION_TYPES = [
  'task_overdue',
  'task_due_soon',
  'task_due_3d',
  'task_due_7d',
] as const satisfies readonly NotificationType[];

export type DigestNotificationType = (typeof DIGEST_NOTIFICATION_TYPES)[number];

/**
 * Two sweep rows belong together when they were written this close. A daily
 * sweep inserts one row at a time across every team, so a run takes seconds to
 * a few minutes; half an hour is long enough to hold one run together and far
 * shorter than the day between two of them.
 */
export const DIGEST_WINDOW_MS = 30 * 60 * 1000;

export function isDigestType(type: string): type is DigestNotificationType {
  return (DIGEST_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

export type NotificationEntry =
  | { kind: 'single'; notification: TaskNotification }
  | {
      kind: 'digest';
      /** Stable while the run's newest row is the same row. */
      id: string;
      type: DigestNotificationType;
      notifications: TaskNotification[];
      unreadCount: number;
      /** When the newest row in the run was written. */
      newestAt: string;
    };

type OpenRun = {
  members: TaskNotification[];
  lastAt: number;
};

type Slot =
  | { kind: 'single'; notification: TaskNotification }
  | { kind: 'run'; type: DigestNotificationType; run: OpenRun };

/**
 * Folds runs of sweep rows into digests and leaves everything else alone.
 *
 * Input is the bell's list, newest first. A digest takes the place of its
 * newest row, so the order the person reads is the order they arrived in.
 * Sweep rows of a different tier never mix, a row in between (a comment, an
 * assignment) does not split a run, and a row with no usable time is never
 * grouped, because it cannot be shown to belong to anything.
 */
export function groupNotifications(list: TaskNotification[]): NotificationEntry[] {
  const slots: Slot[] = [];
  const open = new Map<DigestNotificationType, OpenRun>();

  for (const notification of list) {
    const at = Date.parse(notification.createdAt);
    if (!isDigestType(notification.type) || !Number.isFinite(at)) {
      slots.push({ kind: 'single', notification });
      continue;
    }

    const current = open.get(notification.type);
    if (current && Math.abs(current.lastAt - at) <= DIGEST_WINDOW_MS) {
      current.members.push(notification);
      current.lastAt = at;
      continue;
    }

    const run: OpenRun = { members: [notification], lastAt: at };
    open.set(notification.type, run);
    slots.push({ kind: 'run', type: notification.type, run });
  }

  return slots.map((slot): NotificationEntry => {
    if (slot.kind === 'single') return slot;
    const { members } = slot.run;
    if (members.length < 2) return { kind: 'single', notification: members[0] };
    return {
      kind: 'digest',
      id: `digest:${slot.type}:${members[0].id}`,
      type: slot.type,
      notifications: members,
      unreadCount: members.reduce((count, n) => (n.read ? count : count + 1), 0),
      newestAt: members[0].createdAt,
    };
  });
}

/** The headline of a digest: "5 activities are overdue". */
export function getDigestMessage(type: DigestNotificationType, count: number): string {
  switch (type) {
    case 'task_overdue':
      return `${count} activities are overdue`;
    case 'task_due_soon':
      return `${count} activities are due soon`;
    case 'task_due_3d':
      return `${count} activities are due in 3 days`;
    case 'task_due_7d':
      return `${count} activities are due in 7 days`;
  }
}

/**
 * The line under a digest: up to three titles in full, then the first two and
 * a count. No Oxford comma, the house rule.
 */
export function describeDigestTitles(titles: string[]): string {
  const clean = titles.map((title) => title.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length <= 3) {
    return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
  }
  return `${clean[0]}, ${clean[1]} and ${clean.length - 2} more`;
}
