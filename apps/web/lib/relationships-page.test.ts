import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeLastContact,
  isQuiet,
  isRelationshipsPageEnabled,
  lastTouch,
  parseTagInput,
  QUIET_DAYS,
  relationshipHref,
  roleLine,
  sortByLastContact,
  timeSince,
  whatsappHref,
} from './relationships-page';

const NOW = new Date('2026-10-03T12:00:00Z');

describe('isRelationshipsPageEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('needs both flags', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', '');
    expect(isRelationshipsPageEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_WORKSPACE', 'true');
    expect(isRelationshipsPageEnabled()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'false');
    expect(isRelationshipsPageEnabled()).toBe(false);
  });
});

describe('describeLastContact', () => {
  it('says plainly when nobody has been in touch', () => {
    expect(describeLastContact(null, NOW)).toBe('Not contacted yet');
    expect(describeLastContact('nonsense', NOW)).toBe('Not contacted yet');
  });

  it('counts days, then months, then years', () => {
    expect(describeLastContact('2026-10-03T08:00:00Z', NOW)).toBe('Contacted today');
    expect(describeLastContact('2026-10-02T08:00:00Z', NOW)).toBe('Contacted yesterday');
    expect(describeLastContact('2026-09-23T12:00:00Z', NOW)).toBe('Contacted 10 days ago');
    expect(describeLastContact('2026-05-03T12:00:00Z', NOW)).toBe('Contacted 5 months ago');
    expect(describeLastContact('2023-10-03T12:00:00Z', NOW)).toBe('Contacted 3 years ago');
  });
});

describe('parseTagInput', () => {
  it('splits, trims, lowercases and dedupes', () => {
    expect(parseTagInput(' Mixing, lagos\nMIXING,, ')).toEqual(['mixing', 'lagos']);
    expect(parseTagInput('')).toEqual([]);
  });
});

describe('relationshipHref', () => {
  it('encodes the id', () => {
    expect(relationshipHref('a b')).toBe('/dashboard/relationships/a%20b');
  });
});

describe('My People (URG-306)', () => {
  const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
  const person = (lastDays: number | null, addedDays = 400) => ({
    lastContactAt: lastDays === null ? null : at(lastDays),
    createdAt: at(addedDays),
  });

  it('Quiet is six weeks without contact, one constant', () => {
    expect(QUIET_DAYS).toBe(42);
    expect(isQuiet(person(41), NOW)).toBe(false);
    expect(isQuiet(person(42), NOW)).toBe(true);
  });

  it('counts somebody never contacted from when they were added', () => {
    expect(isQuiet(person(null, 3), NOW)).toBe(false);
    expect(isQuiet(person(null, 50), NOW)).toBe(true);
    expect(lastTouch({ lastContactAt: null, createdAt: '' })).toBeNull();
  });

  it('shows the time since the way the mock does', () => {
    expect(timeSince(at(0), NOW)).toBe('today');
    expect(timeSince(at(2), NOW)).toBe('2d');
    expect(timeSince(at(7), NOW)).toBe('1w');
    expect(timeSince(at(49), NOW)).toBe('7w');
    expect(timeSince(at(95), NOW)).toBe('3mo');
    expect(timeSince(at(800), NOW)).toBe('2y');
    expect(timeSince(null, NOW)).toBe('');
  });

  it('puts Quiet people first, longest silence on top, then the most recent', () => {
    const items = [
      { id: '2d', ...person(2) },
      { id: '7w', ...person(49) },
      { id: '2w', ...person(14) },
      { id: '3mo', ...person(95) },
      { id: '1w', ...person(7) },
    ];
    expect(sortByLastContact(items, NOW).map((item) => item.id)).toEqual(['3mo', '7w', '2d', '1w', '2w']);
  });

  it('reads role · company, either alone', () => {
    expect(roleLine({ role: 'A&R', company: 'Eko Sound' })).toBe('A&R · Eko Sound');
    expect(roleLine({ role: '', company: 'Eko Sound' })).toBe('Eko Sound');
    expect(roleLine({ role: 'PR', company: '' })).toBe('PR');
  });

  it('builds a WhatsApp link from digits only', () => {
    expect(whatsappHref('+234 803 000 0000')).toBe('https://wa.me/2348030000000');
  });
});
