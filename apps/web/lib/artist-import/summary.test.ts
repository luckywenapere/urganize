import { describe, expect, it } from 'vitest';
import { describeImportedMusic, isNewRelease } from './summary';

describe('describeImportedMusic', () => {
  it('names the latest month and the first year', () => {
    expect(
      describeImportedMusic([{ releaseDate: '2019-04-02' }, { releaseDate: '2026-08-15' }, { releaseDate: null }])
    ).toEqual({ latest: 'Aug 2026', first: '2019' });
  });

  it('says nothing when no release has a date', () => {
    expect(describeImportedMusic([{ releaseDate: null }])).toEqual({ latest: null, first: null });
  });
});

describe('isNewRelease', () => {
  it('marks a release out in the last 30 days, release day included', () => {
    expect(isNewRelease('2026-10-30', '2026-10-30')).toBe(true);
    expect(isNewRelease('2026-09-30', '2026-10-30')).toBe(true);
    expect(isNewRelease('2026-09-29', '2026-10-30')).toBe(false);
  });

  it('never marks a future or undated release', () => {
    expect(isNewRelease('2026-11-02', '2026-10-30')).toBe(false);
    expect(isNewRelease(null, '2026-10-30')).toBe(false);
  });
});
