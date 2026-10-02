import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISTRIBUTION_PARTNER,
  SAFE_LEAD_DAYS,
  buildDistributionChecks,
  isDistributionEnabled,
  releaseDateWarning,
  summarizeDistribution,
  type DistributionFacts,
} from './distribution';

const allOn = { metadata: true, song: true, coverArt: true };

const complete: DistributionFacts = {
  releaseDate: '2026-12-01',
  hasSong: true,
  hasCoverArt: true,
  metadata: { genre: 'Afrobeats', language: 'English', explicit: false, labelName: 'Midnight' },
  creditsCount: 2,
};

const checksFor = (over: Partial<DistributionFacts> = {}, flags = allOn) =>
  buildDistributionChecks({ ...complete, ...over }, flags);

const byKey = (checks: ReturnType<typeof checksFor>, key: string) =>
  checks.find((check) => check.key === key)!;

describe('the partner', () => {
  it('is Therealmusic Distro, with the sign-up link the partner gave us', () => {
    expect(DISTRIBUTION_PARTNER.name).toBe('Therealmusic Distro');
    expect(DISTRIBUTION_PARTNER.signupUrl).toBe('https://therealmusicdistro.com/urganize/');
    expect(DISTRIBUTION_PARTNER.termsUrl).toMatch(/^https:\/\/therealmusicdistro\.com\//);
  });
});

describe('buildDistributionChecks', () => {
  it('marks a complete rollout as ready, with nothing open', () => {
    const summary = summarizeDistribution(checksFor());
    expect(summary.ready).toBe(true);
    expect(summary.requiredDone).toBe(summary.requiredTotal);
    expect(summary.recommendedOpen).toBe(0);
  });

  it('asks for six things and recommends two', () => {
    const checks = checksFor();
    expect(checks.filter((c) => c.required).map((c) => c.key)).toEqual([
      'date',
      'song',
      'cover',
      'genre',
      'language',
      'explicit',
    ]);
    expect(checks.filter((c) => !c.required).map((c) => c.key)).toEqual(['credits', 'label']);
  });

  it('treats an explicit flag of false as an answer, and only null as missing', () => {
    expect(byKey(checksFor({ metadata: { ...complete.metadata!, explicit: false } }), 'explicit').done).toBe(true);
    expect(byKey(checksFor({ metadata: { ...complete.metadata!, explicit: true } }), 'explicit').done).toBe(true);
    expect(byKey(checksFor({ metadata: { ...complete.metadata!, explicit: null } }), 'explicit').done).toBe(false);
  });

  it('reads a blank or whitespace-only text field as missing', () => {
    const blank = { ...complete.metadata!, genre: '   ', language: '' };
    const checks = checksFor({ metadata: blank });
    expect(byKey(checks, 'genre').done).toBe(false);
    expect(byKey(checks, 'language').done).toBe(false);
  });

  it('is not ready when there is no metadata row at all', () => {
    const summary = summarizeDistribution(checksFor({ metadata: null }));
    expect(summary.ready).toBe(false);
    expect(summary.requiredDone).toBe(3); // date, song, cover
  });

  it('is not ready without the song, the cover or the date, one at a time', () => {
    expect(summarizeDistribution(checksFor({ hasSong: false })).ready).toBe(false);
    expect(summarizeDistribution(checksFor({ hasCoverArt: false })).ready).toBe(false);
    expect(summarizeDistribution(checksFor({ releaseDate: null })).ready).toBe(false);
  });

  it('is ready with the recommended items still open, which only count as a nudge', () => {
    const summary = summarizeDistribution(
      checksFor({ creditsCount: 0, metadata: { ...complete.metadata!, labelName: null } })
    );
    expect(summary.ready).toBe(true);
    expect(summary.recommendedOpen).toBe(2);
  });

  it('offers a way to fix an item only where that scene is switched on', () => {
    const on = checksFor({ hasSong: false, hasCoverArt: false, metadata: null });
    expect(byKey(on, 'song').fixIn).toBe('song');
    expect(byKey(on, 'cover').fixIn).toBe('coverart');
    expect(byKey(on, 'genre').fixIn).toBe('metadata');

    const off = checksFor(
      { hasSong: false, hasCoverArt: false, metadata: null },
      { metadata: false, song: false, coverArt: false }
    );
    expect(byKey(off, 'song').fixIn).toBeNull();
    expect(byKey(off, 'cover').fixIn).toBeNull();
    expect(byKey(off, 'genre').fixIn).toBeNull();
  });

  it('has no way to fix the date from here, since it is set on the rollout', () => {
    expect(byKey(checksFor({ releaseDate: null }), 'date').fixIn).toBeNull();
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
});

describe('isDistributionEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is on only for the literal word true', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_DISTRIBUTION', 'true');
    expect(isDistributionEnabled()).toBe(true);
    for (const value of ['', 'false', '1', 'yes', 'TRUE']) {
      vi.stubEnv('NEXT_PUBLIC_FEATURE_DISTRIBUTION', value);
      expect(isDistributionEnabled(), value).toBe(false);
    }
  });
});

describe('the copy', () => {
  it('uses no em dash and never calls the object a release in a sentence a person reads', () => {
    const sentences = checksFor({ hasSong: false, hasCoverArt: false, metadata: null, releaseDate: null })
      .flatMap((check) => [check.label, check.hint])
      .concat(releaseDateWarning('2026-10-05', new Date('2026-10-03')) ?? []);
    for (const line of sentences) {
      expect(line, line).not.toMatch(/[—–]/);
      expect(line, line).not.toMatch(/\bship(ped|ping)?\b/i);
      expect(line, line).not.toMatch(/workspace/i);
    }
  });
});
