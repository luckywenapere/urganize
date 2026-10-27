import { describe, expect, it } from 'vitest';
import {
  RECORD_ASK_COPY,
  canSeeRecordAsks,
  describeOutFor,
  describeSessionQuestion,
  pickRecordAsk,
  pickSessionToCheck,
  pickWhatsNext,
  snoozeUntil,
  type AskRelease,
  type CheckableSession,
} from './record-ask';

const NOW = new Date('2026-10-27T10:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => NOW.getTime() - n * DAY;

const release = (over: Partial<AskRelease> & { id: string }): AskRelease => ({
  title: 'Gold Dust',
  artistId: 'a1',
  artistName: 'Kemi Ade',
  liveAt: daysAgo(7),
  upcoming: false,
  ...over,
});

const base = {
  releases: [] as AskRelease[],
  artistsMaking: new Set<string>(),
  snoozedUntil: new Map<string, string>(),
  scopeArtistId: null as string | null,
};

describe('pickWhatsNext', () => {
  it('asks a week after a release went live', () => {
    const ask = pickWhatsNext({ ...base, releases: [release({ id: 'r1' })] }, NOW);
    expect(ask).toEqual({ kind: 'whats_next', artistId: 'a1', artistName: 'Kemi Ade', releaseTitle: 'Gold Dust', daysOut: 7 });
  });

  it('waits until the seventh day', () => {
    expect(pickWhatsNext({ ...base, releases: [release({ id: 'r1', liveAt: daysAgo(6) })] }, NOW)).toBeNull();
  });

  it('stops asking about a release out more than 90 days', () => {
    expect(pickWhatsNext({ ...base, releases: [release({ id: 'r1', liveAt: daysAgo(91) })] }, NOW)).toBeNull();
  });

  it('never asks about a release that is not live', () => {
    expect(pickWhatsNext({ ...base, releases: [release({ id: 'r1', liveAt: null })] }, NOW)).toBeNull();
  });

  it('reads the artist by their latest live release', () => {
    const ask = pickWhatsNext(
      {
        ...base,
        releases: [release({ id: 'old', title: 'Slow Rain', liveAt: daysAgo(60) }), release({ id: 'new', liveAt: daysAgo(3) })],
      },
      NOW
    );
    // The newest one is only 3 days out, so this artist waits.
    expect(ask).toBeNull();
  });

  it('skips an artist with a record in the making', () => {
    expect(pickWhatsNext({ ...base, releases: [release({ id: 'r1' })], artistsMaking: new Set(['a1']) }, NOW)).toBeNull();
  });

  it('skips an artist whose next release is already dated ahead', () => {
    const releases = [release({ id: 'r1' }), release({ id: 'r2', liveAt: null, upcoming: true })];
    expect(pickWhatsNext({ ...base, releases }, NOW)).toBeNull();
  });

  it('skips a snoozed artist until the snooze ends', () => {
    const releases = [release({ id: 'r1' })];
    const later = new Map([['a1', '2026-11-05T10:00:00Z']]);
    expect(pickWhatsNext({ ...base, releases, snoozedUntil: later }, NOW)).toBeNull();
    const over = new Map([['a1', '2026-10-26T10:00:00Z']]);
    expect(pickWhatsNext({ ...base, releases, snoozedUntil: over }, NOW)?.artistId).toBe('a1');
  });

  it('a teammate scoped to one artist is only asked about that artist', () => {
    const releases = [release({ id: 'r1', artistId: 'a1' }), release({ id: 'r2', artistId: 'a2', artistName: 'Tolu' })];
    expect(pickWhatsNext({ ...base, releases, scopeArtistId: 'a2' }, NOW)?.artistId).toBe('a2');
  });

  it('asks about the artist whose release went live most recently first', () => {
    const releases = [
      release({ id: 'r1', artistId: 'a1', liveAt: daysAgo(30) }),
      release({ id: 'r2', artistId: 'a2', artistName: 'Tolu', title: 'Pressure', liveAt: daysAgo(8) }),
    ];
    expect(pickWhatsNext({ ...base, releases }, NOW)?.artistId).toBe('a2');
  });
});

const session = (over: Partial<CheckableSession> & { id: string }): CheckableSession => ({
  recordId: 'rec1',
  date: '2026-10-26',
  status: 'planned',
  ...over,
});

describe('pickSessionToCheck', () => {
  const today = '2026-10-27';

  it('asks the day after a planned session', () => {
    expect(pickSessionToCheck([session({ id: 's1' })], today)?.id).toBe('s1');
  });

  it('never asks on the day itself or before', () => {
    expect(pickSessionToCheck([session({ id: 's1', date: today })], today)).toBeNull();
    expect(pickSessionToCheck([session({ id: 's1', date: '2026-10-30' })], today)).toBeNull();
  });

  it('asks once: an answered session is never asked again', () => {
    for (const status of ['happened', 'moved', 'cancelled'] as const) {
      expect(pickSessionToCheck([session({ id: 's1', status })], today)).toBeNull();
    }
  });

  it('a session with only words is never asked', () => {
    expect(pickSessionToCheck([session({ id: 's1', date: null })], today)).toBeNull();
  });

  it('lets a session older than two weeks go', () => {
    expect(pickSessionToCheck([session({ id: 's1', date: '2026-10-12' })], today)).toBeNull();
    expect(pickSessionToCheck([session({ id: 's1', date: '2026-10-13' })], today)?.id).toBe('s1');
  });

  it('asks about the most recent session first', () => {
    const picked = pickSessionToCheck([session({ id: 'old', date: '2026-10-20' }), session({ id: 'new', date: '2026-10-25' })], today);
    expect(picked?.id).toBe('new');
  });
});

describe('pickRecordAsk', () => {
  it('a session check comes before what is next: it is once and dated', () => {
    const whatsNext = { kind: 'whats_next' as const, artistId: 'a1', artistName: 'Kemi Ade', releaseTitle: 'Gold Dust', daysOut: 7 };
    const sessionCheck = { kind: 'session_check' as const, sessionId: 's1' };
    expect(pickRecordAsk({ whatsNext, sessionCheck })).toBe(sessionCheck);
    expect(pickRecordAsk({ whatsNext, sessionCheck: null })).toBe(whatsNext);
    expect(pickRecordAsk({ whatsNext: null, sessionCheck: null })).toBeNull();
  });
});

describe('who is asked', () => {
  it('check-ins go to the manager: owners and admins, never members or guests', () => {
    expect(canSeeRecordAsks('owner')).toBe(true);
    expect(canSeeRecordAsks('admin')).toBe(true);
    expect(canSeeRecordAsks('member')).toBe(false);
    expect(canSeeRecordAsks('guest')).toBe(false);
    expect(canSeeRecordAsks(undefined)).toBe(false);
  });
});

describe('copy', () => {
  it('says how long the release has been out in plain words', () => {
    expect(describeOutFor(7)).toBe('a week');
    expect(describeOutFor(13)).toBe('a week');
    expect(describeOutFor(14)).toBe('2 weeks');
    expect(describeOutFor(40)).toBe('a month');
    expect(describeOutFor(70)).toBe('2 months');
  });

  it('asks what is next the way the mock does', () => {
    expect(RECORD_ASK_COPY.whatsNextTitle({ releaseTitle: 'Gold Dust', artistName: 'Kemi Ade', daysOut: 7 })).toBe(
      '"Gold Dust" has been out a week. What\'s next for Kemi Ade?'
    );
    expect(RECORD_ASK_COPY.snooze).toBe('Nothing yet, ask me in 2 weeks');
  });

  it('names the day and the people in the session question', () => {
    const today = '2026-10-27';
    expect(describeSessionQuestion({ date: '2026-10-26', people: [{ name: 'Tolu' }] }, today)).toBe(
      "Did yesterday's session with Tolu happen?"
    );
    expect(describeSessionQuestion({ date: '2026-10-24', people: [] }, today)).toBe('Did the session on Sat 24 Oct happen?');
    expect(describeSessionQuestion({ date: '2026-10-26', people: [{ name: 'Tolu' }, { name: 'Dami' }] }, today)).toBe(
      "Did yesterday's session with Tolu and Dami happen?"
    );
    expect(
      describeSessionQuestion({ date: '2026-10-26', people: [{ name: 'Tolu' }, { name: 'Dami' }, { name: 'Bayo' }] }, today)
    ).toBe("Did yesterday's session with Tolu and 2 others happen?");
  });

  it('never uses an em dash', () => {
    const all = JSON.stringify(RECORD_ASK_COPY) + describeSessionQuestion({ date: '2026-10-26', people: [] }, '2026-10-27');
    expect(all).not.toContain('—');
  });
});

describe('snoozeUntil', () => {
  it('is two weeks from now', () => {
    expect(snoozeUntil(NOW)).toBe('2026-11-10T10:00:00.000Z');
  });
});
