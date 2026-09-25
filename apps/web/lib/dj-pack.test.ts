import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PACK_EXPIRY_DAYS,
  buildNudgeLink,
  defaultPackExpiry,
  describeReceipt,
  isPackExpired,
  needsNudge,
  parseRecipient,
  relativeDay,
  type RecipientReceipt,
} from './dj-pack';

const receipt = (over: Partial<RecipientReceipt> = {}): RecipientReceipt => ({
  id: 'r1',
  name: 'Tunde',
  role: 'DJ',
  token: 'tok',
  revokedAt: null,
  lastViewedAt: null,
  lastDownloadedAt: null,
  downloadCount: 0,
  ...over,
});

const NOW = new Date('2026-09-14T12:00:00.000Z');

describe('describeReceipt', () => {
  // The whole point of per-recipient tokens: this sentence has to be
  // answerable, and "Not opened" is the case a manager acts on.
  it('says plainly when nobody has opened it', () => {
    expect(describeReceipt(receipt(), NOW)).toBe('Not opened');
  });

  it('distinguishes opened-but-not-downloaded from downloaded', () => {
    expect(describeReceipt(receipt({ lastViewedAt: '2026-09-14T09:00:00.000Z' }), NOW)).toBe(
      'Opened today, no download'
    );
    expect(
      describeReceipt(
        { ...receipt(), lastViewedAt: '2026-09-12T09:00:00.000Z', lastDownloadedAt: '2026-09-12T09:05:00.000Z' },
        NOW
      )
    ).toBe('Downloaded 2 days ago');
  });

  it('reports a turned-off link before anything else', () => {
    const revoked = receipt({ revokedAt: '2026-09-13T00:00:00.000Z', lastDownloadedAt: '2026-09-12T00:00:00.000Z' });
    expect(describeReceipt(revoked, NOW)).toBe('Link turned off');
  });
});

describe('needsNudge', () => {
  // Opened but never downloaded still counts: the DJ does not have the tracks.
  it('flags anyone without a download, including someone who only looked', () => {
    expect(needsNudge(receipt())).toBe(true);
    expect(needsNudge(receipt({ lastViewedAt: '2026-09-14T09:00:00.000Z' }))).toBe(true);
    expect(needsNudge(receipt({ lastDownloadedAt: '2026-09-14T09:00:00.000Z' }))).toBe(false);
  });

  it('does not chase a revoked link', () => {
    expect(needsNudge(receipt({ revokedAt: '2026-09-13T00:00:00.000Z' }))).toBe(false);
  });
});

describe('relativeDay', () => {
  it('reads in days, which is the precision the question has', () => {
    expect(relativeDay('2026-09-14T01:00:00.000Z', NOW, 'UTC')).toBe('today');
    expect(relativeDay('2026-09-13T01:00:00.000Z', NOW, 'UTC')).toBe('yesterday');
    expect(relativeDay('2026-09-10T01:00:00.000Z', NOW, 'UTC')).toBe('4 days ago');
  });

  it('counts calendar days, so ten to midnight seen at ten past is yesterday', () => {
    expect(relativeDay('2026-09-13T23:50:00.000Z', new Date('2026-09-14T00:10:00.000Z'), 'UTC')).toBe(
      'yesterday'
    );
    // The same two instants on Lagos's clock (UTC+1) are both the 14th.
    expect(
      relativeDay('2026-09-13T23:50:00.000Z', new Date('2026-09-14T00:10:00.000Z'), 'Africa/Lagos')
    ).toBe('today');
    // And on this device's clock, whatever zone the machine is in.
    expect(relativeDay(new Date(2026, 8, 13, 23, 50).toISOString(), new Date(2026, 8, 14, 0, 10))).toBe(
      'yesterday'
    );
  });

  it('calls a time from the future today rather than a negative number', () => {
    expect(relativeDay('2026-09-15T01:00:00.000Z', NOW, 'UTC')).toBe('today');
  });

  it('degrades rather than throwing on a bad timestamp', () => {
    expect(relativeDay('not a date', NOW)).toBe('at some point');
  });
});

describe('buildNudgeLink', () => {
  it('opens WhatsApp with the link already in the message', () => {
    const url = buildNudgeLink({
      recipientName: 'Tunde Adebayo',
      showTitle: 'Flytime Fest',
      packUrl: 'https://app.urganize.app/pack/abc',
    });
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Tunde');
    expect(text).not.toContain('Adebayo'); // first name only
    expect(text).toContain('Flytime Fest');
    expect(text).toContain('https://app.urganize.app/pack/abc');
  });

  it('addresses the contact directly when a number is known', () => {
    const url = buildNudgeLink({
      recipientName: 'Tunde',
      showTitle: 'X',
      packUrl: 'https://u/p',
      phone: '+234 706 736 7057',
    });
    expect(url.startsWith('https://wa.me/2347067367057?text=')).toBe(true);
  });

  it('still produces a usable link for a blank name', () => {
    const url = buildNudgeLink({ recipientName: '   ', showTitle: 'X', packUrl: 'https://u/p' });
    expect(decodeURIComponent(url)).toContain('Hi there');
  });
});

describe('parseRecipient', () => {
  it('trims and keeps an optional role', () => {
    expect(parseRecipient({ name: '  Tunde  ', role: ' DJ ' })).toEqual({ name: 'Tunde', role: 'DJ' });
    expect(parseRecipient({ name: 'Tunde' })).toEqual({ name: 'Tunde', role: null });
    expect(parseRecipient({ name: 'Tunde', role: '   ' })).toEqual({ name: 'Tunde', role: null });
  });

  it('needs a name', () => {
    expect(parseRecipient({})).toHaveProperty('error');
    expect(parseRecipient({ name: '   ' })).toHaveProperty('error');
    expect(parseRecipient({ name: 'x'.repeat(200) })).toHaveProperty('error');
  });
});

describe('expiry', () => {
  it('defaults to a few days after the show, so a late Saturday still works Monday', () => {
    const expiry = defaultPackExpiry('2026-09-12T20:30:00.000Z');
    expect(expiry).toBe('2026-09-15T20:30:00.000Z');
    expect(DEFAULT_PACK_EXPIRY_DAYS).toBe(3);
  });

  // A link with no show date must not quietly expire three days from nothing.
  it('sets no expiry when the show has no date yet', () => {
    expect(defaultPackExpiry(null)).toBeNull();
    expect(defaultPackExpiry('soon')).toBeNull();
  });

  it('treats a null expiry as never expiring', () => {
    expect(isPackExpired(null, NOW)).toBe(false);
    expect(isPackExpired('2026-09-13T00:00:00.000Z', NOW)).toBe(true);
    expect(isPackExpired('2026-09-15T00:00:00.000Z', NOW)).toBe(false);
  });
});
