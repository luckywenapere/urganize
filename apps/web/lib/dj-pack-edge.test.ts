import { describe, expect, it } from 'vitest';
import {
  MAX_RECIPIENT_NAME_LENGTH,
  MAX_RECIPIENT_ROLE_LENGTH,
  buildNudgeLink,
  decidePackGate,
  defaultPackExpiry,
  describePackReadiness,
  describeReceipt,
  describeSentSetRefusal,
  isPackExpired,
  parseRecipient,
  reopenedPackExpiry,
  type RecipientReceipt,
} from './dj-pack';

/**
 * The DJ pack: who can open a link, when it stops working, what the manager
 * is told before sending, and the one sentence per person afterwards.
 */

const NOW = new Date('2026-09-25T12:00:00.000Z');
const PAST = '2026-09-24T12:00:00.000Z';
const FUTURE = '2026-09-26T12:00:00.000Z';

describe('decidePackGate: what a link shows', () => {
  const REVOKED = [null, PAST] as const;
  const STATUSES = [null, 'draft', 'confirmed', 'done', 'cancelled', 'something new'] as const;
  const EXPIRIES = [null, PAST, NOW.toISOString(), FUTURE, 'not a date'] as const;

  it('decides every combination, in the order that protects the people involved', () => {
    let checked = 0;
    for (const recipientRevokedAt of REVOKED) {
      for (const eventStatus of STATUSES) {
        for (const packExpiresAt of EXPIRIES) {
          const gate = decidePackGate({ recipientRevokedAt, eventStatus, packExpiresAt, now: NOW });
          const expired = packExpiresAt === PAST || packExpiresAt === NOW.toISOString();
          const expected = recipientRevokedAt
            ? 'unavailable'
            : eventStatus === 'cancelled'
              ? 'cancelled'
              : expired
                ? 'expired'
                : 'ok';
          expect(gate, JSON.stringify({ recipientRevokedAt, eventStatus, packExpiresAt })).toBe(expected);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(2 * 6 * 5);
  });

  it('never tells someone whose link was turned off that the show was cancelled', () => {
    expect(
      decidePackGate({ recipientRevokedAt: PAST, eventStatus: 'cancelled', packExpiresAt: PAST, now: NOW })
    ).toBe('unavailable');
  });

  it('says the show is off rather than that the link lapsed', () => {
    expect(decidePackGate({ recipientRevokedAt: null, eventStatus: 'cancelled', packExpiresAt: PAST, now: NOW })).toBe(
      'cancelled'
    );
  });

  it('keeps a played show’s link working until it expires, for the Monday re-download', () => {
    expect(decidePackGate({ recipientRevokedAt: null, eventStatus: 'done', packExpiresAt: FUTURE, now: NOW })).toBe(
      'ok'
    );
  });
});

describe('when a link stops working', () => {
  it.each([
    ['2026-09-12T20:30:00.000Z', '2026-09-15T20:30:00.000Z'],
    ['2026-12-31T23:30:00.000Z', '2027-01-03T23:30:00.000Z'],
    ['2028-02-27T20:00:00.000Z', '2028-03-01T20:00:00.000Z'], // through a leap day
  ])('a show at %s expires at %s', (start, expiry) => {
    expect(defaultPackExpiry(start)).toBe(expiry);
  });

  it('expires at the exact instant, not a moment later', () => {
    expect(isPackExpired('2026-09-25T12:00:00.000Z', NOW)).toBe(true);
    expect(isPackExpired('2026-09-25T12:00:00.001Z', NOW)).toBe(false);
  });

  it('never expires a link it cannot read, rather than locking a DJ out over bad data', () => {
    expect(isPackExpired('not a date', NOW)).toBe(false);
  });

  it.each([
    // [show start, expected reopened expiry]
    [null, '2026-09-28T12:00:00.000Z'], // no date: three days from now
    ['2026-09-20T20:00:00.000Z', '2026-09-28T12:00:00.000Z'], // show passed: three days from now
    ['2026-10-10T20:00:00.000Z', '2026-10-13T20:00:00.000Z'], // show ahead: never shortened
    ['soon', '2026-09-28T12:00:00.000Z'],
  ])('reopening for a show at %s works until %s', (start, expiry) => {
    expect(reopenedPackExpiry(start, NOW)).toBe(expiry);
  });

  it('never shortens a link by reopening it, whenever the show is', () => {
    for (let days = -30; days <= 30; days += 1) {
      const start = new Date(NOW.getTime() + days * 86_400_000).toISOString();
      const reopened = Date.parse(reopenedPackExpiry(start, NOW));
      expect(reopened, `${days}`).toBeGreaterThanOrEqual(Date.parse(defaultPackExpiry(start) as string));
      expect(reopened, `${days}`).toBeGreaterThanOrEqual(NOW.getTime() + 3 * 86_400_000);
    }
  });
});

describe('describePackReadiness: what the manager is told before sending', () => {
  const song = (hasFile: boolean) => ({ itemType: 'song', version: hasFile ? { id: 'v' } : null });
  const cue = (itemType: string) => ({ itemType, version: null });
  const promise = 'They get their own private link. You can turn it off later, but you can’t unsend it.';

  it.each([
    ['an empty set', [], 0, 0, '', 'There are no songs in this set yet.'],
    ['only talk and breaks', [cue('talk'), cue('break')], 0, 0, '', 'There are no songs in this set yet.'],
    ['one song with a file', [song(true)], 1, 0, '', `1 track. ${promise}`],
    [
      'one song with no file',
      [song(false)],
      1,
      1,
      'The song has no file yet. Add it so there is something to download.',
      `1 track, none with a file yet, so there will be nothing to download. ${promise}`,
    ],
    [
      'three songs, none with a file',
      [song(false), song(false), song(false)],
      3,
      3,
      'None of the songs have a file yet. Add them so there is something to download.',
      `3 tracks, none with a file yet, so there will be nothing to download. ${promise}`,
    ],
    [
      'three songs, one missing a file',
      [song(true), song(false), song(true)],
      3,
      1,
      '1 of 3 songs has no file yet. It will show as missing for the DJ.',
      `3 tracks, and 1 has no file yet, so it will show as missing. ${promise}`,
    ],
    [
      'four songs, two missing, and a talk that is never a file',
      [song(true), song(false), cue('talk'), song(false), song(true)],
      4,
      2,
      '2 of 4 songs have no file yet. They will show as missing for the DJ.',
      `4 tracks, and 2 have no file yet, so they will show as missing. ${promise}`,
    ],
    [
      'rows with no type, which are songs',
      [{ version: { id: 'v' } }, { itemType: null, version: null }],
      2,
      1,
      '1 of 2 songs has no file yet. It will show as missing for the DJ.',
      `2 tracks, and 1 has no file yet, so it will show as missing. ${promise}`,
    ],
  ])('%s', (_name, items, songs, missingFiles, summary, detail) => {
    expect(describePackReadiness(items)).toEqual({ songs, missingFiles, summary, detail });
  });

  it('counts only songs as tracks, whatever mix of rows a set has', () => {
    // Every mix of up to 4 songs (with or without files) and 3 cues.
    for (let withFile = 0; withFile <= 4; withFile += 1) {
      for (let withoutFile = 0; withoutFile <= 4; withoutFile += 1) {
        for (let cues = 0; cues <= 3; cues += 1) {
          const items = [
            ...Array.from({ length: withFile }, () => song(true)),
            ...Array.from({ length: withoutFile }, () => song(false)),
            ...Array.from({ length: cues }, () => cue('interlude')),
          ];
          const readiness = describePackReadiness(items);
          expect(readiness.songs).toBe(withFile + withoutFile);
          expect(readiness.missingFiles).toBe(withoutFile);
          expect(readiness.summary === '').toBe(withoutFile === 0);
        }
      }
    }
  });
});

describe('describeSentSetRefusal', () => {
  it.each([
    [['Tunde'], 'This set went to Tunde, so it is kept as the record of who downloaded it. You can rename it.'],
    [
      ['Tunde', 'Ada'],
      'This set went to Tunde and 1 other, so it is kept as the record of who downloaded it. You can rename it.',
    ],
    [
      ['Tunde', 'Ada', 'Kemi'],
      'This set went to Tunde and 2 others, so it is kept as the record of who downloaded it. You can rename it.',
    ],
    [
      ['  Tunde  ', ''],
      'This set went to Tunde and 1 other, so it is kept as the record of who downloaded it. You can rename it.',
    ],
    [[], 'This set went to someone, so it is kept as the record of who downloaded it. You can rename it.'],
  ])('names who it went to: %j', (names, sentence) => {
    expect(describeSentSetRefusal(names)).toBe(sentence);
  });
});

describe('describeReceipt: one line per person', () => {
  const receipt = (over: Partial<RecipientReceipt> = {}): RecipientReceipt => ({
    id: 'r1',
    name: 'Tunde',
    role: 'DJ',
    token: 't',
    revokedAt: null,
    lastViewedAt: null,
    lastDownloadedAt: null,
    downloadCount: 0,
    ...over,
  });

  it.each([
    [{}, 'Not opened'],
    [{ lastViewedAt: '2026-09-25T09:00:00.000Z' }, 'Opened today, no download'],
    [{ lastViewedAt: '2026-09-24T09:00:00.000Z' }, 'Opened yesterday, no download'],
    [{ lastDownloadedAt: '2026-09-25T09:00:00.000Z' }, 'Downloaded today'],
    [{ lastViewedAt: '2026-09-25T09:00:00.000Z', lastDownloadedAt: '2026-09-22T09:00:00.000Z' }, 'Downloaded 3 days ago'],
    [{ revokedAt: PAST, lastDownloadedAt: PAST }, 'Link turned off'],
  ])('%j reads %s', (over, line) => {
    expect(describeReceipt(receipt(over), NOW, 'UTC')).toBe(line);
  });
});

describe('buildNudgeLink', () => {
  const text = (url: string) => decodeURIComponent(url.split('text=')[1]);

  it('survives a show title full of characters a URL treats specially', () => {
    const url = buildNudgeLink({
      recipientName: 'Tunde',
      showTitle: 'Flytime Fest & Friends #3: 50% off?',
      packUrl: 'https://app.urganize.app/pack/abc?x=1&y=2',
    });
    expect(text(url)).toBe(
      'Hi Tunde, here are the tracks for Flytime Fest & Friends #3: 50% off?: https://app.urganize.app/pack/abc?x=1&y=2'
    );
    expect(url.split('?').length).toBe(2); // only the one query separator is raw
  });

  it.each([
    ['+234 706 736 7057', 'https://wa.me/2347067367057?text='],
    ['(0706) 736-7057', 'https://wa.me/07067367057?text='],
    ['', 'https://wa.me/?text='],
    [null, 'https://wa.me/?text='],
    ['no digits', 'https://wa.me/?text='],
  ])('addresses a phone written as %j', (phone, start) => {
    expect(buildNudgeLink({ recipientName: 'A', showTitle: 'X', packUrl: 'https://u/p', phone }).startsWith(start)).toBe(
      true
    );
  });

  it('greets by the first name only, including a name that is not in Latin letters', () => {
    expect(text(buildNudgeLink({ recipientName: 'Ọlá Adé', showTitle: 'X', packUrl: 'https://u/p' }))).toMatch(
      /^Hi Ọlá,/
    );
  });
});

describe('parseRecipient', () => {
  it.each([
    [{ name: 'x'.repeat(MAX_RECIPIENT_NAME_LENGTH) }, true],
    [{ name: 'x'.repeat(MAX_RECIPIENT_NAME_LENGTH + 1) }, false],
    [{ name: 'Tunde', role: 'x'.repeat(MAX_RECIPIENT_ROLE_LENGTH) }, true],
    [{ name: 'Tunde', role: 'x'.repeat(MAX_RECIPIENT_ROLE_LENGTH + 1) }, false],
    [{ name: 42 }, false],
    [{ name: null }, false],
    [{ name: 'Tunde', role: 7 }, true], // a role that is not text is dropped, not refused
  ])('%j is accepted: %s', (input, accepted) => {
    expect('error' in parseRecipient(input)).toBe(!accepted);
  });
});
