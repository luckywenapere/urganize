import type { TaskNotification } from '@/lib/tasks';
import { getNotificationMessage } from '@/lib/tasks';
import { getDigestMessage, isDigestType, type DigestNotificationType } from '@/lib/notification-groups';

/**
 * What the bell says when several rows arrive at once (2026-10-09, v1.92.8).
 *
 * The daily due-date sweep inserts one row per task, so an app left open at
 * 07:00 UTC got a fetch and a toast for every row ("An activity is overdue" a
 * dozen times in a row). The bell now collects the rows that arrive within
 * `TOAST_BURST_WINDOW_MS`, fetches once, and shows one toast that says what the
 * burst was. Pure, so the rules can be tested without a browser.
 */

/** Rows that arrive within this long of the first are one burst. */
export const TOAST_BURST_WINDOW_MS = 1200;

/**
 * After a burst of one sweep tier has toasted, another of the same tier inside
 * this long stays quiet: it is the same sweep still writing, not new news. The
 * bell itself still refreshes.
 */
export const TIER_TOAST_COOLDOWN_MS = 30_000;

export type ToastBurst = {
  message: string;
  /** Set when the burst was one sweep tier, so the cooldown can key on it. */
  tier: DigestNotificationType | null;
};

/**
 * The toast for a burst. `insertedIds` is every row that arrived (it can be
 * longer than `list`, which the API caps at `NOTIFICATION_LIST_LIMIT` rows), and `list` is the bell's
 * list after one refresh, used to learn what the rows were.
 *
 * - One row: exactly what a single arrival said before ("Ada assigned you an
 *   activity: Mix"), or "New notification" when the row is not in the list.
 * - Several rows that are all one sweep tier: "12 activities are overdue".
 * - Anything else: "5 new notifications".
 */
export function describeToastBurst(insertedIds: string[], list: TaskNotification[]): ToastBurst {
  const ids = new Set(insertedIds);
  const total = ids.size;
  const matched = list.filter((notification) => ids.has(notification.id));

  if (total <= 1) {
    const only = matched[0];
    if (!only) return { message: 'New notification', tier: null };
    const headline = getNotificationMessage(only);
    return {
      message: only.taskTitle ? `${headline}: ${only.taskTitle}` : headline,
      tier: isDigestType(only.type) ? only.type : null,
    };
  }

  const first = matched[0];
  if (
    first &&
    isDigestType(first.type) &&
    matched.every((notification) => notification.type === first.type)
  ) {
    return { message: getDigestMessage(first.type, total), tier: first.type };
  }
  return { message: `${total} new notifications`, tier: null };
}

/** True when a toast for this tier already showed recently enough to skip this one. */
export function isTierToastCoolingDown(
  lastShownAt: ReadonlyMap<DigestNotificationType, number>,
  tier: DigestNotificationType | null,
  now: number
): boolean {
  if (!tier) return false;
  const last = lastShownAt.get(tier);
  if (last === undefined) return false;
  return now - last < TIER_TOAST_COOLDOWN_MS;
}
