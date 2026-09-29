import { describe, expect, it } from 'vitest';
import { buildPlacements } from './placements';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function pitch(overrides: Partial<Parameters<typeof buildPlacements>[0][number]> = {}) {
  return {
    id: 'p1',
    releaseId: 'r1',
    releaseTitle: 'Midnight EP',
    playlistName: 'Late Night Radar',
    curatorName: 'SoundRise',
    songTitle: 'Skyline',
    status: 'new' as const,
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildPlacements', () => {
  it('sorts added pitches into placed', () => {
    const result = buildPlacements([pitch({ status: 'added' })], NOW);
    expect(result.placed).toHaveLength(1);
    expect(result.underReview).toHaveLength(0);
  });

  it('sorts new and listened pitches into underReview', () => {
    const result = buildPlacements([pitch({ id: 'a', status: 'new' }), pitch({ id: 'b', status: 'listened' })], NOW);
    expect(result.underReview).toHaveLength(2);
    expect(result.placed).toHaveLength(0);
  });

  it('drops passed pitches from both lists', () => {
    const result = buildPlacements([pitch({ status: 'passed' })], NOW);
    expect(result.placed).toHaveLength(0);
    expect(result.underReview).toHaveLength(0);
  });

  it('computes sentDaysAgo from createdAt', () => {
    const result = buildPlacements([pitch({ status: 'new', createdAt: '2026-09-25T00:00:00.000Z' })], NOW);
    expect(result.underReview[0].sentDaysAgo).toBe(4);
  });

  it('never returns a negative sentDaysAgo for a pitch created "in the future" (clock skew)', () => {
    const result = buildPlacements([pitch({ status: 'new', createdAt: '2026-10-05T00:00:00.000Z' })], NOW);
    expect(result.underReview[0].sentDaysAgo).toBe(0);
  });
});
