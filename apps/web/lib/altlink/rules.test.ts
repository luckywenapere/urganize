import { describe, expect, it } from 'vitest';
import {
  ctrPercent,
  daysUntilRelease,
  decideCreate,
  isReleasedOn,
  mapLinkStatus,
  normalizeIsrc,
  normalizeUpc,
  orderPlatforms,
  readAltlinkEvent,
  readLink,
  readStats,
  smartLinkPhase,
  statsAreFresh,
  type SmartLinkFacts,
} from './rules';
import { signAltlinkBody, verifyAltlinkSignature } from './signature';

// 2026-10-22 12:00 Lagos (11:00 UTC).
const NOW = Date.parse('2026-10-22T11:00:00Z');

const facts = (over: Partial<SmartLinkFacts> = {}): SmartLinkFacts => ({
  title: 'Free Mind',
  artistName: 'Tems',
  releaseDate: '2026-11-06',
  upc: '123456789012',
  isrc: null,
  isTest: false,
  isArchived: false,
  ...over,
});

describe('codes', () => {
  it('takes 12 or 13 digit UPCs, ignoring spaces and dashes', () => {
    expect(normalizeUpc('1234 5678 9012')).toBe('123456789012');
    expect(normalizeUpc('1234567890123')).toBe('1234567890123');
    expect(normalizeUpc('12345')).toBeNull();
    expect(normalizeUpc('12345678901234')).toBeNull();
    expect(normalizeUpc(null)).toBeNull();
  });
  it('takes a 12 character ISRC, upper-cased, without dashes', () => {
    expect(normalizeIsrc('ng-a1b-26-00001')).toBe('NGA1B2600001');
    expect(normalizeIsrc('NGA1B260000')).toBeNull();
    expect(normalizeIsrc('')).toBeNull();
  });
});

describe('decideCreate (trigger conditions)', () => {
  it('waits with no code', () => {
    expect(decideCreate(facts({ upc: null, isrc: null }), NOW)).toEqual({ ready: false, reason: 'no_code' });
  });
  it('makes a pre-save for a future date, with that date', () => {
    expect(decideCreate(facts(), NOW)).toEqual({ ready: true, type: 'pre_save', releaseDate: '2026-11-06' });
  });
  it('accepts an ISRC alone', () => {
    expect(decideCreate(facts({ upc: null, isrc: 'NGA1B2600001' }), NOW).ready).toBe(true);
  });
  it('makes a normal smart link for a past date, sending no date', () => {
    expect(decideCreate(facts({ releaseDate: '2026-09-01' }), NOW)).toEqual({
      ready: true,
      type: 'smart_link',
      releaseDate: null,
    });
  });
  it('treats release day itself as out', () => {
    expect(decideCreate(facts({ releaseDate: '2026-10-22' }), NOW)).toMatchObject({ ready: true, type: 'smart_link' });
  });
  it('waits for a title, an artist and a date', () => {
    expect(decideCreate(facts({ title: 'Untitled rollout' }), NOW)).toEqual({ ready: false, reason: 'no_title' });
    expect(decideCreate(facts({ artistName: null }), NOW)).toEqual({ ready: false, reason: 'no_artist' });
    expect(decideCreate(facts({ releaseDate: null }), NOW)).toEqual({ ready: false, reason: 'no_date' });
  });
  it('never makes one for a test or archived rollout', () => {
    expect(decideCreate(facts({ isTest: true }), NOW)).toEqual({ ready: false, reason: 'test' });
    expect(decideCreate(facts({ isArchived: true }), NOW)).toEqual({ ready: false, reason: 'archived' });
  });
});

describe('dates in Lagos', () => {
  it('counts days to release from the Lagos calendar day', () => {
    expect(daysUntilRelease('2026-11-06', NOW)).toBe(15);
    expect(daysUntilRelease('2026-10-23', NOW)).toBe(1);
    // 23:30 UTC on the 21st is already the 22nd in Lagos.
    expect(isReleasedOn('2026-10-22', Date.parse('2026-10-21T23:30:00Z'))).toBe(true);
  });
});

describe('verifyAltlinkSignature', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event_id: 'evt_1', type: 'presave.signup', data: {} });
  const t = Math.floor(NOW / 1000);

  it('accepts a valid signature', () => {
    expect(verifyAltlinkSignature(secret, body, signAltlinkBody(secret, body, t), NOW)).toEqual({ ok: true, timestamp: t });
  });
  it('refuses a tampered body', () => {
    const header = signAltlinkBody(secret, body, t);
    expect(verifyAltlinkSignature(secret, body.replace('evt_1', 'evt_2'), header, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });
  it('refuses the wrong secret', () => {
    expect(verifyAltlinkSignature('other', body, signAltlinkBody(secret, body, t), NOW).ok).toBe(false);
  });
  it('refuses a stale timestamp (more than 5 minutes)', () => {
    const old = t - 6 * 60;
    expect(verifyAltlinkSignature(secret, body, signAltlinkBody(secret, body, old), NOW)).toEqual({ ok: false, reason: 'stale' });
  });
  it('refuses a missing or malformed header, and no secret', () => {
    expect(verifyAltlinkSignature(secret, body, null, NOW)).toEqual({ ok: false, reason: 'no_signature' });
    expect(verifyAltlinkSignature(secret, body, 'v1=abc', NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyAltlinkSignature(secret, body, `t=${t},v1=zz`, NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyAltlinkSignature('', body, signAltlinkBody(secret, body, t), NOW)).toEqual({ ok: false, reason: 'no_secret' });
  });
});

describe('payloads', () => {
  it('reads the create response link', () => {
    const link = readLink({
      id: 'lnk_1',
      slug: 'free-mind',
      url: 'https://altlink.co/free-mind',
      external_release_id: 'rel-1',
      type: 'pre_save',
      release_date: '2026-11-06',
      status: 'scheduled',
      claim_url: 'https://altlink.co/claim/x',
      platforms: [],
    });
    expect(link).toMatchObject({ id: 'lnk_1', url: 'https://altlink.co/free-mind', claimUrl: 'https://altlink.co/claim/x' });
  });
  it('reads a platforms_updated event', () => {
    const event = readAltlinkEvent({
      event_id: 'evt_9',
      type: 'link.platforms_updated',
      data: { link_id: 'lnk_1', platforms: [{ id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/x', is_active: true }] },
    });
    expect(event?.eventId).toBe('evt_9');
    expect(event?.linkId).toBe('lnk_1');
    expect(event?.platforms?.[0]).toMatchObject({ id: 'spotify', isActive: true });
  });
  it('reads stats and CTR as a whole percent', () => {
    const stats = readStats({ views: 210, clicks: 150, ctr: 0.714, presaves: 40, top_platforms: [{ platform: 'spotify', clicks: 90, percentage: 60 }] });
    expect(stats).toMatchObject({ views: 210, clicks: 150, presaves: 40 });
    expect(ctrPercent(stats!.ctr)).toBe(71);
    expect(ctrPercent(71)).toBe(71);
  });
  it('keeps stats for 10 minutes', () => {
    expect(statsAreFresh(new Date(NOW - 9 * 60_000).toISOString(), NOW)).toBe(true);
    expect(statsAreFresh(new Date(NOW - 11 * 60_000).toISOString(), NOW)).toBe(false);
    expect(statsAreFresh(null, NOW)).toBe(false);
  });
  it('lists found stores first', () => {
    const ordered = orderPlatforms([
      { id: 'tidal', name: 'Tidal', url: null, isActive: false },
      { id: 'spotify', name: 'Spotify', url: 'https://x', isActive: true },
    ]);
    expect(ordered.map((p) => p.id)).toEqual(['spotify', 'tidal']);
  });
  it('maps Altlink status words', () => {
    expect(mapLinkStatus('converted')).toBe('converted');
    expect(mapLinkStatus('active')).toBe('live');
    expect(mapLinkStatus('scheduled')).toBe('scheduled');
  });
});

describe('smartLinkPhase', () => {
  const row = { status: 'scheduled', url: 'https://altlink.co/x' };
  it('maps rows to view states', () => {
    expect(smartLinkPhase(null, '2026-11-06', NOW)).toBe('none');
    expect(smartLinkPhase({ status: 'pending', url: null }, '2026-11-06', NOW)).toBe('creating');
    expect(smartLinkPhase({ status: 'failed', url: null }, '2026-11-06', NOW)).toBe('failed');
    expect(smartLinkPhase(row, '2026-11-06', NOW)).toBe('presave');
    expect(smartLinkPhase(row, '2026-10-01', NOW)).toBe('released');
    expect(smartLinkPhase({ status: 'converted', url: 'https://x' }, '2026-11-06', NOW)).toBe('released');
  });
});
