import { describe, expect, it } from 'vitest';
import {
  TRASH_RETENTION_DAYS,
  formatDaysLeft,
  isPurgeDue,
  isRolloutDeleted,
  matchesDeleteConfirmation,
  purgeCutoff,
  trashDaysLeft,
  trashPurgeAt,
  trashUrgency,
} from './rollout-trash';

const NOW = new Date('2026-10-23T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('purge window', () => {
  it('is 30 days', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(trashPurgeAt('2026-10-01T00:00:00Z').toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('counts days left, rounding up', () => {
    expect(trashDaysLeft(daysAgo(0), NOW)).toBe(30);
    expect(trashDaysLeft(daysAgo(1), NOW)).toBe(29);
    expect(trashDaysLeft(daysAgo(29.5), NOW)).toBe(1);
    expect(trashDaysLeft(daysAgo(45), NOW)).toBe(0);
  });

  it('is due exactly at 30 days, not before', () => {
    expect(isPurgeDue(daysAgo(29.99), NOW)).toBe(false);
    expect(isPurgeDue(daysAgo(30), NOW)).toBe(true);
    expect(isPurgeDue(daysAgo(31), NOW)).toBe(true);
  });

  it('cutoff keeps anything deleted in the last 30 days', () => {
    const cutoff = purgeCutoff(NOW);
    expect(new Date(daysAgo(29)).getTime()).toBeGreaterThan(cutoff.getTime());
    expect(new Date(daysAgo(31)).getTime()).toBeLessThan(cutoff.getTime());
  });

  it('badge urgency turns amber under 7 and red under 2', () => {
    expect(trashUrgency(29)).toBe('normal');
    expect(trashUrgency(7)).toBe('normal');
    expect(trashUrgency(6)).toBe('soon');
    expect(trashUrgency(2)).toBe('soon');
    expect(trashUrgency(1)).toBe('urgent');
    expect(trashUrgency(0)).toBe('urgent');
  });

  it('formats the days-left label', () => {
    expect(formatDaysLeft(29)).toBe('29 days left');
    expect(formatDaysLeft(1)).toBe('1 day left');
    expect(formatDaysLeft(0)).toBe('Removing soon');
  });
});

describe('typed delete confirmation', () => {
  it('accepts the rollout name in any case, trimmed', () => {
    expect(matchesDeleteConfirmation('Lagos to London EP', 'Lagos to London EP')).toBe(true);
    expect(matchesDeleteConfirmation('  lagos TO london ep ', 'Lagos to London EP')).toBe(true);
  });

  it('accepts DELETE in any case', () => {
    expect(matchesDeleteConfirmation('DELETE', 'Midnight Run')).toBe(true);
    expect(matchesDeleteConfirmation('delete', 'Midnight Run')).toBe(true);
  });

  it('rejects partial, empty and non-string input', () => {
    expect(matchesDeleteConfirmation('Lagos to Lon', 'Lagos to London EP')).toBe(false);
    expect(matchesDeleteConfirmation('', 'Lagos to London EP')).toBe(false);
    expect(matchesDeleteConfirmation('   ', '')).toBe(false);
    expect(matchesDeleteConfirmation(undefined, 'x')).toBe(false);
    expect(matchesDeleteConfirmation(true, 'x')).toBe(false);
    expect(matchesDeleteConfirmation('deleted', 'x')).toBe(false);
  });
});

describe('isRolloutDeleted', () => {
  it('is true only when deleted_at is set', () => {
    expect(isRolloutDeleted({ deleted_at: '2026-10-23T00:00:00Z' })).toBe(true);
    expect(isRolloutDeleted({ deleted_at: null })).toBe(false);
    expect(isRolloutDeleted({})).toBe(false);
    expect(isRolloutDeleted(null)).toBe(false);
  });
});
