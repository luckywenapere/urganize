import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NotificationType, TaskNotification } from '@/lib/tasks';
import {
  BELL_BADGE_CAP,
  DIGEST_WINDOW_MS,
  bellBadge,
  describeDigestTitles,
  getDigestMessage,
  groupNotifications,
} from '@/lib/notification-groups';

/**
 * The notification bell (2026-10-09, v1.92.7).
 *
 * A live review found two things. The badge read "9+" while the button's spoken
 * name said "20 unread", and the dropdown filled with near-identical "An
 * activity is overdue" rows: the daily due-date sweep writes one row per task,
 * all within seconds of each other, so a team with a backlog saw twenty of
 * them stamped "13h ago". The badge and the spoken name now come from one
 * function, and a run of sweep rows is shown as one expandable line.
 */

let counter = 0;

function row(
  over: Partial<TaskNotification> & { type: NotificationType; createdAt: string }
): TaskNotification {
  counter += 1;
  return {
    id: `n-${counter}`,
    userId: 'u1',
    taskId: `t-${counter}`,
    actorId: null,
    read: false,
    taskTitle: `Task ${counter}`,
    actorName: 'System',
    taskStatus: 'todo',
    taskReleaseId: 'r1',
    ...over,
  };
}

/** `minutes` before a fixed instant, as an ISO string. */
function at(minutesBefore: number): string {
  return new Date(Date.UTC(2026, 9, 9, 7, 0, 0) - minutesBefore * 60_000).toISOString();
}

describe('bellBadge', () => {
  it('shows nothing for zero and keeps the plain name', () => {
    expect(bellBadge(0)).toEqual({ visible: false, label: '', ariaLabel: 'Notifications' });
  });

  it('shows the exact count up to the cap', () => {
    expect(bellBadge(1).label).toBe('1');
    expect(bellBadge(1).ariaLabel).toBe('Notifications, 1 unread');
    expect(bellBadge(BELL_BADGE_CAP).label).toBe('9');
    expect(bellBadge(BELL_BADGE_CAP).ariaLabel).toBe('Notifications, 9 unread');
  });

  it('says "9+" on screen and "more than 9" aloud once the cap is passed', () => {
    for (const count of [10, 20, 55]) {
      const badge = bellBadge(count);
      expect(badge.visible).toBe(true);
      expect(badge.label).toBe('9+');
      expect(badge.ariaLabel).toBe('Notifications, more than 9 unread');
    }
  });

  it('never speaks a number the screen does not show', () => {
    for (let count = 1; count <= 40; count += 1) {
      const { label, ariaLabel } = bellBadge(count);
      const spoken = ariaLabel.match(/\d+/)?.[0];
      // Under the cap the digits match; over it the only digit spoken is the cap.
      expect(spoken).toBe(count > BELL_BADGE_CAP ? String(BELL_BADGE_CAP) : label);
    }
  });
});

describe('groupNotifications', () => {
  it('folds a run of overdue sweep rows into one digest', () => {
    const list = [0, 1, 1, 2, 3].map((m) => row({ type: 'task_overdue', createdAt: at(m) }));
    const entries = groupNotifications(list);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.kind).toBe('digest');
    if (entry.kind !== 'digest') return;
    expect(entry.type).toBe('task_overdue');
    expect(entry.notifications).toHaveLength(5);
    expect(entry.unreadCount).toBe(5);
    expect(entry.newestAt).toBe(at(0));
  });

  it('leaves a lone sweep row as an ordinary row', () => {
    const only = row({ type: 'task_overdue', createdAt: at(0) });
    expect(groupNotifications([only])).toEqual([{ kind: 'single', notification: only }]);
  });

  it('never groups notifications that are about a person or a one-off', () => {
    const types: NotificationType[] = [
      'task_assigned',
      'task_commented',
      'task_status_changed',
      'pitch_reminder_28d',
    ];
    const list = types.flatMap((type) => [
      row({ type, createdAt: at(0) }),
      row({ type, createdAt: at(0) }),
    ]);
    const entries = groupNotifications(list);
    expect(entries).toHaveLength(list.length);
    expect(entries.every((entry) => entry.kind === 'single')).toBe(true);
  });

  it('keeps different sweep tiers apart', () => {
    const list = [
      row({ type: 'task_overdue', createdAt: at(0) }),
      row({ type: 'task_due_soon', createdAt: at(0) }),
      row({ type: 'task_overdue', createdAt: at(1) }),
      row({ type: 'task_due_soon', createdAt: at(1) }),
    ];
    const entries = groupNotifications(list);
    expect(entries.map((e) => (e.kind === 'digest' ? e.type : 'single'))).toEqual([
      'task_overdue',
      'task_due_soon',
    ]);
  });

  it('is not split by a different notification landing in the middle of a sweep', () => {
    const list = [
      row({ type: 'task_overdue', createdAt: at(0) }),
      row({ type: 'task_assigned', createdAt: at(1), actorName: 'Ada' }),
      row({ type: 'task_overdue', createdAt: at(2) }),
    ];
    const entries = groupNotifications(list);
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe('digest');
    expect(entries[1].kind).toBe('single');
  });

  it('puts a digest where its newest row was', () => {
    const assigned = row({ type: 'task_assigned', createdAt: at(0), actorName: 'Ada' });
    const list = [
      assigned,
      row({ type: 'task_overdue', createdAt: at(10) }),
      row({ type: 'task_overdue', createdAt: at(11) }),
    ];
    const entries = groupNotifications(list);
    expect(entries.map((e) => e.kind)).toEqual(['single', 'digest']);
  });

  it('starts a new digest when the gap between sweeps is bigger than the window', () => {
    const gap = DIGEST_WINDOW_MS / 60_000 + 1;
    const list = [
      row({ type: 'task_overdue', createdAt: at(0) }),
      row({ type: 'task_overdue', createdAt: at(1) }),
      row({ type: 'task_overdue', createdAt: at(1 + gap) }),
      row({ type: 'task_overdue', createdAt: at(2 + gap) }),
    ];
    const entries = groupNotifications(list);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === 'digest')).toBe(true);
  });

  it('chains a long sweep whose rows are each close to the last', () => {
    // 20 rows, 10 minutes apart: 190 minutes end to end, but never more than
    // one window between neighbours.
    const list = Array.from({ length: 20 }, (_, i) =>
      row({ type: 'task_overdue', createdAt: at(i * 10) })
    );
    const entries = groupNotifications(list);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind === 'digest' && entries[0].notifications.length).toBe(20);
  });

  it('counts only unread rows as unread and flags a mixed digest', () => {
    const list = [
      row({ type: 'task_overdue', createdAt: at(0), read: true }),
      row({ type: 'task_overdue', createdAt: at(1), read: false }),
      row({ type: 'task_overdue', createdAt: at(2), read: true }),
    ];
    const [entry] = groupNotifications(list);
    expect(entry.kind === 'digest' && entry.unreadCount).toBe(1);
  });

  it('never groups a row it cannot date', () => {
    const list = [
      row({ type: 'task_overdue', createdAt: 'not a date' }),
      row({ type: 'task_overdue', createdAt: 'not a date' }),
    ];
    expect(groupNotifications(list).every((e) => e.kind === 'single')).toBe(true);
  });

  it('gives a digest a stable id that does not depend on later rows', () => {
    const a = row({ type: 'task_overdue', createdAt: at(0) });
    const b = row({ type: 'task_overdue', createdAt: at(1) });
    const c = row({ type: 'task_overdue', createdAt: at(2) });
    const small = groupNotifications([a, b])[0];
    const large = groupNotifications([a, b, c])[0];
    expect(small.kind === 'digest' && large.kind === 'digest' && small.id).toBe(
      large.kind === 'digest' ? large.id : null
    );
  });

  it('returns nothing for an empty list and never reorders what it keeps', () => {
    expect(groupNotifications([])).toEqual([]);
    const list = [
      row({ type: 'task_commented', createdAt: at(0), actorName: 'Ada' }),
      row({ type: 'task_assigned', createdAt: at(5), actorName: 'Bo' }),
    ];
    expect(groupNotifications(list).map((e) => (e.kind === 'single' ? e.notification.id : ''))).toEqual(
      list.map((n) => n.id)
    );
  });
});

describe('digest copy', () => {
  it('names the tier and the count', () => {
    expect(getDigestMessage('task_overdue', 5)).toBe('5 activities are overdue');
    expect(getDigestMessage('task_due_soon', 3)).toBe('3 activities are due soon');
    expect(getDigestMessage('task_due_3d', 2)).toBe('2 activities are due in 3 days');
    expect(getDigestMessage('task_due_7d', 12)).toBe('12 activities are due in 7 days');
  });

  it('lists up to three titles in full, with no Oxford comma', () => {
    expect(describeDigestTitles(['A', 'B'])).toBe('A and B');
    expect(describeDigestTitles(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('shortens a long list to two titles and a count', () => {
    expect(describeDigestTitles(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more');
    expect(describeDigestTitles(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B and 4 more');
  });

  it('skips blank titles and copes with nothing at all', () => {
    expect(describeDigestTitles(['A', '  ', 'B'])).toBe('A and B');
    expect(describeDigestTitles([])).toBe('');
    expect(describeDigestTitles(['Solo'])).toBe('Solo');
  });

  it('follows the house copy rules: no em dash, never "task" or "workspace"', () => {
    const lines = [
      getDigestMessage('task_overdue', 4),
      getDigestMessage('task_due_soon', 4),
      getDigestMessage('task_due_3d', 4),
      getDigestMessage('task_due_7d', 4),
      describeDigestTitles(['A', 'B', 'C', 'D']),
    ].join(' ');
    expect(lines).not.toMatch(/[—–]/);
    expect(lines.toLowerCase()).not.toMatch(/\btasks?\b|workspace/);
  });
});

describe('the bell uses them', () => {
  const bell = readFileSync(join(process.cwd(), 'components/app/NotificationsBell.tsx'), 'utf8');

  it('builds its badge and spoken name from bellBadge, not inline', () => {
    expect(bell).toContain("from '@/lib/notification-groups'");
    expect(bell).toContain('bellBadge(unreadCount)');
    expect(bell).not.toContain("'9+'");
    expect(bell).not.toMatch(/Notifications, \$\{unreadCount\} unread/);
  });

  it('renders the list through groupNotifications', () => {
    expect(bell).toContain('groupNotifications(notifications)');
    expect(bell).toContain('aria-expanded');
  });
});
