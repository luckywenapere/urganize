import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_GROUPS,
  describeAudience,
  finalizeRecipients,
  isValidEmailAddress,
  ownTeamCounts,
  parseAudience,
} from './audience';

describe('parseAudience', () => {
  it('accepts everyone and the waitlist', () => {
    expect(parseAudience({ kind: 'everyone' })).toEqual({ ok: true, audience: { kind: 'everyone' } });
    expect(parseAudience({ kind: 'waitlist' })).toEqual({ ok: true, audience: { kind: 'waitlist' } });
  });

  it('accepts each group, and defaults "signed up recently" to 14 days', () => {
    for (const group of AUDIENCE_GROUPS) {
      expect(parseAudience({ kind: 'group', group }).ok).toBe(true);
    }
    expect(parseAudience({ kind: 'group', group: 'recent' })).toEqual({
      ok: true,
      audience: { kind: 'group', group: 'recent', days: 14 },
    });
  });

  it('reads the number of days, and refuses one out of range', () => {
    expect(parseAudience({ kind: 'group', group: 'recent', days: '30' })).toEqual({
      ok: true,
      audience: { kind: 'group', group: 'recent', days: 30 },
    });
    expect(parseAudience({ kind: 'group', group: 'recent', days: 0 }).ok).toBe(false);
    expect(parseAudience({ kind: 'group', group: 'recent', days: 400 }).ok).toBe(false);
  });

  it('refuses an unknown group or kind', () => {
    expect(parseAudience({ kind: 'group', group: 'vips' }).ok).toBe(false);
    expect(parseAudience({ kind: 'everybody' }).ok).toBe(false);
    expect(parseAudience(null).ok).toBe(false);
  });

  it('cleans up a single address and refuses a bad one', () => {
    expect(parseAudience({ kind: 'person', email: '  Ada@Example.COM ' })).toEqual({
      ok: true,
      audience: { kind: 'person', email: 'ada@example.com' },
    });
    expect(parseAudience({ kind: 'person', email: 'not an email' }).ok).toBe(false);
  });
});

describe('describeAudience', () => {
  it('says who it goes to in plain words', () => {
    expect(describeAudience({ kind: 'everyone' })).toBe('Everyone with an account');
    expect(describeAudience({ kind: 'group', group: 'recent', days: 7 })).toBe(
      'People who signed up in the last 7 days'
    );
    expect(describeAudience({ kind: 'person', email: 'a@b.co' })).toBe('a@b.co');
  });
});

describe('isValidEmailAddress', () => {
  it('accepts ordinary addresses and refuses obvious junk', () => {
    expect(isValidEmailAddress('ada@example.com')).toBe(true);
    expect(isValidEmailAddress('ada.o+tag@mail.example.co')).toBe(true);
    expect(isValidEmailAddress('ada@example')).toBe(false);
    expect(isValidEmailAddress('ada example.com')).toBe(false);
    expect(isValidEmailAddress('')).toBe(false);
  });
});

describe('finalizeRecipients', () => {
  it('lowercases, drops duplicates and bad addresses, and leaves out suppressed ones', () => {
    const result = finalizeRecipients(
      [
        { email: 'Ada@Example.com', name: 'Ada', userId: null },
        { email: 'ada@example.com', name: 'Ada Obi', userId: 'u1' },
        { email: 'bo@example.com', name: '', userId: 'u2' },
        { email: 'gone@example.com', name: 'Gone', userId: 'u3' },
        { email: 'junk', name: 'Junk', userId: null },
      ],
      new Set(['gone@example.com'])
    );
    expect(result.recipients).toEqual([
      { email: 'ada@example.com', name: 'Ada Obi', userId: 'u1' },
      { email: 'bo@example.com', name: '', userId: 'u2' },
    ]);
    expect(result.suppressedCount).toBe(1);
    expect(result.invalidCount).toBe(1);
  });
});

describe('ownTeamCounts', () => {
  it('counts a person’s own team unless it is just the empty one every invited teammate gets', () => {
    expect(ownTeamCounts({ hasForeignMembership: false, ownsRollouts: false })).toBe(true);
    expect(ownTeamCounts({ hasForeignMembership: true, ownsRollouts: true })).toBe(true);
    expect(ownTeamCounts({ hasForeignMembership: true, ownsRollouts: false })).toBe(false);
  });
});
