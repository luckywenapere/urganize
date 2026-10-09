import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_PARTNER,
  SAFE_LEAD_DAYS,
  releaseDateWarning,
} from './distribution';

// The rules themselves are tested in distribution-rules.test.ts. This file holds
// what is about the partner and the clock.

describe('the partner', () => {
  it('is Therealmusic Distro, with the sign-up link the partner gave us', () => {
    expect(DISTRIBUTION_PARTNER.name).toBe('Therealmusic Distro');
    expect(DISTRIBUTION_PARTNER.signupUrl).toBe('https://therealmusicdistro.com/urganize/');
    expect(DISTRIBUTION_PARTNER.termsUrl).toMatch(/^https:\/\/therealmusicdistro\.com\//);
  });
});

describe('releaseDateWarning', () => {
  const today = new Date('2026-10-03T15:30:00.000Z');

  it('says nothing without a date, or with plenty of time', () => {
    expect(releaseDateWarning(null, today)).toBeNull();
    expect(releaseDateWarning('', today)).toBeNull();
    expect(releaseDateWarning('2026-12-01', today)).toBeNull();
  });

  it('warns when the date is closer than the lead time', () => {
    expect(releaseDateWarning('2026-10-10', today)).toMatch(/14 working days/);
    expect(releaseDateWarning('2026-10-03', today)).toMatch(/14 working days/);
  });

  it('draws the line exactly at the lead time', () => {
    expect(releaseDateWarning('2026-10-23', today)).toMatch(/14 working days/); // 20 days
    expect(releaseDateWarning('2026-10-24', today)).toBeNull(); // 21 days
    expect(SAFE_LEAD_DAYS).toBe(21);
  });

  it('is gentle about a date that has passed, since late releases are normal', () => {
    const warning = releaseDateWarning('2026-09-01', today);
    expect(warning).toMatch(/passed/);
    expect(warning).not.toMatch(/missed/);
  });

  it('reads a full timestamp as its calendar day and ignores junk', () => {
    expect(releaseDateWarning('2026-10-10T23:59:00.000Z', today)).toMatch(/14 working days/);
    expect(releaseDateWarning('not a date', today)).toBeNull();
  });

  it('uses no em dash and never says workspace or ship', () => {
    for (const line of [
      releaseDateWarning('2026-10-05', new Date('2026-10-03')) ?? '',
      releaseDateWarning('2026-09-01', new Date('2026-10-03')) ?? '',
    ]) {
      expect(line).not.toMatch(/[—–]/);
      expect(line).not.toMatch(/\bship(ped|ping)?\b/i);
      expect(line).not.toMatch(/workspace/i);
    }
  });
});

