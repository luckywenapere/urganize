import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NotificationType, TaskNotification } from '@/lib/tasks';
import type { DigestNotificationType } from '@/lib/notification-groups';
import {
  TIER_TOAST_COOLDOWN_MS,
  TOAST_BURST_WINDOW_MS,
  describeToastBurst,
  isTierToastCoolingDown,
} from '@/lib/notification-toast-burst';

/**
 * The bell's toast when rows arrive in a burst (2026-10-09, v1.92.8).
 *
 * An app left open during the 07:00 UTC due-date sweep used to fetch and toast
 * once per inserted row. It now batches the burst into one fetch and one toast
 * that says what happened, and stays quiet for a repeat of the same tier.
 */

let counter = 0;

function row(type: NotificationType, over: Partial<TaskNotification> = {}): TaskNotification {
  counter += 1;
  return {
    id: `n-${counter}`,
    type,
    userId: 'u1',
    taskId: `t-${counter}`,
    actorId: null,
    read: false,
    taskTitle: `Task ${counter}`,
    actorName: 'Ada',
    taskStatus: 'todo',
    taskReleaseId: 'r1',
    createdAt: '2026-10-09T07:00:00.000Z',
    ...over,
  };
}

describe('describeToastBurst', () => {
  it('says what a single arrival always said, with the title', () => {
    const only = row('task_assigned', { taskTitle: 'Mix' });
    expect(describeToastBurst([only.id], [only])).toEqual({
      message: 'Ada assigned you an activity: Mix',
      tier: null,
    });
  });

  it('falls back to a plain line when the row is not in the refreshed list', () => {
    expect(describeToastBurst(['gone'], [])).toEqual({ message: 'New notification', tier: null });
  });

  it('says what a lone sweep row was and keys it by tier', () => {
    const only = row('task_overdue', { taskTitle: 'Master' });
    expect(describeToastBurst([only.id], [only])).toEqual({
      message: 'An activity is overdue: Master',
      tier: 'task_overdue',
    });
  });

  it('turns a burst of one sweep tier into one digest line', () => {
    const rows = Array.from({ length: 12 }, () => row('task_overdue'));
    const burst = describeToastBurst(
      rows.map((r) => r.id),
      rows
    );
    expect(burst).toEqual({ message: '12 activities are overdue', tier: 'task_overdue' });
  });

  it('counts rows the 20-row list cap pushed out of the list', () => {
    const rows = Array.from({ length: 20 }, () => row('task_due_soon'));
    const ids = [...rows.map((r) => r.id), ...Array.from({ length: 10 }, (_, i) => `off-${i}`)];
    expect(describeToastBurst(ids, rows).message).toBe('30 activities are due soon');
  });

  it('does not count the same row twice', () => {
    const a = row('task_overdue');
    const b = row('task_overdue');
    expect(describeToastBurst([a.id, a.id, b.id, b.id], [a, b]).message).toBe('2 activities are overdue');
  });

  it('uses a generic count when the burst mixes kinds', () => {
    const a = row('task_overdue');
    const b = row('task_assigned');
    const c = row('task_overdue');
    expect(describeToastBurst([a.id, b.id, c.id], [a, b, c])).toEqual({
      message: '3 new notifications',
      tier: null,
    });
  });

  it('uses a generic count when it cannot tell what the burst was', () => {
    expect(describeToastBurst(['x', 'y'], [])).toEqual({ message: '2 new notifications', tier: null });
  });

  it('never says task or workspace, and never uses an em dash', () => {
    const rows = Array.from({ length: 4 }, () => row('task_due_3d'));
    const text = [
      describeToastBurst(rows.map((r) => r.id), rows).message,
      describeToastBurst(['a', 'b'], []).message,
    ].join(' ');
    expect(text).not.toMatch(/[—–]/);
    expect(text.toLowerCase()).not.toMatch(/\btasks?\b|workspace/);
  });
});

describe('isTierToastCoolingDown', () => {
  const tier: DigestNotificationType = 'task_overdue';

  it('stays quiet for the same tier inside the cooldown', () => {
    const last = new Map<DigestNotificationType, number>([[tier, 1_000]]);
    expect(isTierToastCoolingDown(last, tier, 1_000 + TIER_TOAST_COOLDOWN_MS - 1)).toBe(true);
  });

  it('speaks again once the cooldown has passed', () => {
    const last = new Map<DigestNotificationType, number>([[tier, 1_000]]);
    expect(isTierToastCoolingDown(last, tier, 1_000 + TIER_TOAST_COOLDOWN_MS)).toBe(false);
  });

  it('does not let one tier silence another', () => {
    const last = new Map<DigestNotificationType, number>([['task_due_soon', 1_000]]);
    expect(isTierToastCoolingDown(last, tier, 2_000)).toBe(false);
  });

  it('never silences a notification that is not a sweep tier', () => {
    const last = new Map<DigestNotificationType, number>([[tier, 1_000]]);
    expect(isTierToastCoolingDown(last, null, 1_001)).toBe(false);
  });

  it('is quiet about nothing it has not shown', () => {
    expect(isTierToastCoolingDown(new Map(), tier, 5)).toBe(false);
  });
});

describe('the bell batches its toasts', () => {
  const bell = readFileSync(join(process.cwd(), 'components/app/NotificationsBell.tsx'), 'utf8');

  it('collects arrivals and fetches once per burst', () => {
    expect(bell).toContain("from '@/lib/notification-toast-burst'");
    expect(bell).toContain('TOAST_BURST_WINDOW_MS');
    expect(bell).toContain('describeToastBurst(');
    expect(bell).toContain('isTierToastCoolingDown(');
  });

  it('does not fetch inside the per-row handler', () => {
    const handler = bell.slice(bell.indexOf("event: 'INSERT'"), bell.indexOf("event: 'DELETE'"));
    expect(handler).not.toContain('fetchNotifications(');
    expect(handler).not.toContain('pushToast(');
  });

  it('clears its pending timer when the channel is torn down', () => {
    expect(bell).toContain('clearTimeout(burstTimer');
  });

  it('keeps the window short enough that a single toast still feels immediate', () => {
    expect(TOAST_BURST_WINDOW_MS).toBeLessThanOrEqual(1500);
    expect(TOAST_BURST_WINDOW_MS).toBeGreaterThan(0);
  });
});
