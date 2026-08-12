import { describe, expect, it } from 'vitest';
import { assignDueTier } from './due-tiers';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('assignDueTier', () => {
  it('returns task_overdue for any past due date', () => {
    expect(assignDueTier(NOW - 1, NOW)).toBe('task_overdue');
    expect(assignDueTier(NOW - DAY * 30, NOW)).toBe('task_overdue');
  });

  it('does not treat a due date exactly now as overdue (< is strict, so it falls into the 24h tier)', () => {
    // dueMs === nowMs is NOT overdue (< is strict) and falls into the 24h tier.
    expect(assignDueTier(NOW, NOW)).toBe('task_due_soon');
  });

  it('returns task_due_soon for the 24h boundary, inclusive', () => {
    expect(assignDueTier(NOW + DAY, NOW)).toBe('task_due_soon');
    expect(assignDueTier(NOW + DAY - 1, NOW)).toBe('task_due_soon');
  });

  it('returns task_due_3d just after the 24h boundary and at the 72h boundary, inclusive', () => {
    expect(assignDueTier(NOW + DAY + 1, NOW)).toBe('task_due_3d');
    expect(assignDueTier(NOW + 3 * DAY, NOW)).toBe('task_due_3d');
  });

  it('returns task_due_7d just after the 72h boundary and at the 7d boundary, inclusive', () => {
    expect(assignDueTier(NOW + 3 * DAY + 1, NOW)).toBe('task_due_7d');
    expect(assignDueTier(NOW + 7 * DAY, NOW)).toBe('task_due_7d');
  });

  it('returns null just beyond the 7d boundary and for far-future dates', () => {
    expect(assignDueTier(NOW + 7 * DAY + 1, NOW)).toBeNull();
    expect(assignDueTier(NOW + 365 * DAY, NOW)).toBeNull();
  });

  it('returns null for non-finite input', () => {
    expect(assignDueTier(Number.NaN, NOW)).toBeNull();
    expect(assignDueTier(NOW, Number.NaN)).toBeNull();
    expect(assignDueTier(Infinity, NOW)).toBeNull();
  });

  it('is idempotent across repeated calls against the same clock', () => {
    const dueMs = NOW + 2 * DAY;
    expect(assignDueTier(dueMs, NOW)).toBe(assignDueTier(dueMs, NOW));
  });
});
