import { describe, expect, it } from 'vitest';
import { RELEASE_DAY_BUTTON, releaseDayOptions } from './release-this-song';

describe('RELEASE_DAY_BUTTON', () => {
  it('says "release" only as the day, per the rollout vocabulary rule (2026-09-09)', () => {
    expect(RELEASE_DAY_BUTTON).toBe('Pick a release day');
  });
});

describe('releaseDayOptions', () => {
  it('offers three Fridays a week apart, the first at least 9 weeks out', () => {
    // Wed 11 Nov 2026: 63 days on is Wed 13 Jan, so the first Friday is 15 Jan.
    const out = releaseDayOptions('2026-11-11');
    expect(out.map((option) => option.date)).toEqual(['2027-01-15', '2027-01-22', '2027-01-29']);
    expect(out.map((option) => option.weeks)).toEqual([9, 10, 11]);
  });

  it('every option is a Friday', () => {
    for (const today of ['2026-11-09', '2026-11-13', '2026-12-31', '2027-02-27']) {
      for (const option of releaseDayOptions(today)) {
        expect(new Date(`${option.date}T12:00:00Z`).getUTCDay()).toBe(5);
      }
    }
  });

  it('when 63 days on is a Friday, that Friday is the first option', () => {
    // Fri 13 Nov 2026 + 63 days = Fri 15 Jan 2027.
    expect(releaseDayOptions('2026-11-13')[0].date).toBe('2027-01-15');
  });

  it('labels each day for a button: weekday, day, month', () => {
    expect(releaseDayOptions('2026-11-11')[1]).toMatchObject({ weekday: 'Fri', day: '22 Jan' });
  });
});
