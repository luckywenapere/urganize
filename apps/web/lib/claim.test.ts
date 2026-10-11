import { describe, expect, it } from 'vitest';
import {
  CLAIM_INVITE_DAYS,
  MAX_CLAIM_ATTEMPTS,
  REMOVAL_DAYS,
  claimInviteExpiry,
  claimInviteState,
  creditCountsForProfile,
  generateClaimToken,
  hashClaimToken,
  isValidClaimToken,
  maskIdentifier,
  parseRemovalContact,
  parseRemovalNote,
  proveContact,
  removalDueAt,
  removalUrgency,
  unclaimedSlug,
} from './claim';

const NOW = new Date('2026-10-10T10:00:00Z');
const base = { usedAt: null, revokedAt: null, expiresAt: '2026-11-01T00:00:00Z', failedAttempts: 0 };

describe('tokens', () => {
  it('makes unguessable, URL-safe tokens that validate', () => {
    const a = generateClaimToken();
    const b = generateClaimToken();
    expect(a).not.toBe(b);
    expect(isValidClaimToken(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
  it('hashes deterministically and never stores the token', () => {
    const token = generateClaimToken();
    expect(hashClaimToken(token)).toBe(hashClaimToken(token));
    expect(hashClaimToken(token)).not.toContain(token);
    expect(hashClaimToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('refuses made-up paths before any lookup', () => {
    for (const bad of ['', 'short', 'has space aaaaaaaaaaaaaaaaaaaaaaa', 'a'.repeat(80), null, 7]) {
      expect(isValidClaimToken(bad)).toBe(false);
    }
  });
  it('expires a link after thirty days', () => {
    expect(claimInviteExpiry(NOW).getTime() - NOW.getTime()).toBe(CLAIM_INVITE_DAYS * 86_400_000);
  });
});

describe('claimInviteState', () => {
  it('is open for a fresh invite', () => {
    expect(claimInviteState(base, NOW)).toBe('open');
  });
  it('used outranks expired and revoked', () => {
    expect(
      claimInviteState(
        { ...base, usedAt: '2026-10-01T00:00:00Z', revokedAt: 'x', expiresAt: '2020-01-01T00:00:00Z' },
        NOW
      )
    ).toBe('used');
  });
  it('reads revoked, expired and an unreadable date as closed', () => {
    expect(claimInviteState({ ...base, revokedAt: '2026-10-02T00:00:00Z' }, NOW)).toBe('revoked');
    expect(claimInviteState({ ...base, expiresAt: '2026-10-10T10:00:00Z' }, NOW)).toBe('expired');
    expect(claimInviteState({ ...base, expiresAt: 'garbage' }, NOW)).toBe('expired');
  });
  it('locks after five wrong tries and not before', () => {
    expect(claimInviteState({ ...base, failedAttempts: MAX_CLAIM_ATTEMPTS - 1 }, NOW)).toBe('open');
    expect(claimInviteState({ ...base, failedAttempts: MAX_CLAIM_ATTEMPTS }, NOW)).toBe('locked');
  });
});

describe('proveContact', () => {
  const ids = [
    { kind: 'email' as const, value: 'tobi@example.com' },
    { kind: 'phone' as const, value: '+2348031234567' },
  ];
  it('accepts a confirmed account email that is on the credit', () => {
    const r = proveContact({
      typed: '',
      accountEmail: 'Tobi@Example.com',
      accountEmailConfirmed: true,
      identifiers: ids,
    });
    expect(r).toMatchObject({ ok: true, via: 'account_email' });
  });
  it('does not accept an UNCONFIRMED account email', () => {
    const r = proveContact({
      typed: '',
      accountEmail: 'tobi@example.com',
      accountEmailConfirmed: false,
      identifiers: ids,
    });
    expect(r).toEqual({ ok: false, reason: 'no_match' });
  });
  it('accepts a typed email or a phone written another way', () => {
    expect(
      proveContact({ typed: ' TOBI@example.com ', accountEmail: null, accountEmailConfirmed: false, identifiers: ids })
    ).toMatchObject({ ok: true, via: 'typed_email' });
    expect(
      proveContact({ typed: '0803 123 4567', accountEmail: null, accountEmailConfirmed: false, identifiers: ids })
    ).toMatchObject({ ok: true, via: 'typed_phone' });
  });
  it('refuses a contact that is not on the credit, and a profile with none', () => {
    expect(
      proveContact({
        typed: 'other@example.com',
        accountEmail: 'other@example.com',
        accountEmailConfirmed: true,
        identifiers: ids,
      })
    ).toEqual({ ok: false, reason: 'no_match' });
    expect(
      proveContact({ typed: 'tobi@example.com', accountEmail: null, accountEmailConfirmed: false, identifiers: [] })
    ).toEqual({ ok: false, reason: 'nothing_to_check' });
  });
  it('never matches on a name', () => {
    expect(
      proveContact({ typed: 'Tobi', accountEmail: null, accountEmailConfirmed: false, identifiers: ids })
    ).toEqual({ ok: false, reason: 'no_match' });
  });
});

describe('maskIdentifier', () => {
  it('hides most of an email and a phone number', () => {
    expect(maskIdentifier({ kind: 'email', value: 'tobi@example.com' })).toBe('t***@example.com');
    expect(maskIdentifier({ kind: 'phone', value: '+2348031234567' })).toBe('+234 *** *** 4567');
    expect(maskIdentifier({ kind: 'email', value: 'broken' })).toBe('');
  });
});

describe('unclaimedSlug', () => {
  it('reads as the person and cannot be guessed from the name alone', () => {
    expect(unclaimedSlug('Tobi Adeyemi', 'k3m9x')).toBe('tobi-adeyemi-k3m9x');
  });
  it('always matches the database shape', () => {
    for (const name of ['Ørjan Çelik', '   ', '😀😀', 'A', 'x'.repeat(200)]) {
      const slug = unclaimedSlug(name);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(slug.length).toBeGreaterThanOrEqual(2);
      expect(slug.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('removal', () => {
  it('is due three days after the request', () => {
    expect(removalDueAt(NOW).getTime() - NOW.getTime()).toBe(REMOVAL_DAYS * 86_400_000);
  });
  it('sorts urgency: on track, due soon in the last day, overdue after', () => {
    const due = removalDueAt(NOW).toISOString();
    expect(removalUrgency(due, NOW)).toBe('on_track');
    expect(removalUrgency(due, new Date(NOW.getTime() + 2.5 * 86_400_000))).toBe('due_soon');
    expect(removalUrgency(due, new Date(NOW.getTime() + 3 * 86_400_000))).toBe('overdue');
    expect(removalUrgency('nope', NOW)).toBe('overdue');
  });
  it('takes one email or one phone and nothing else', () => {
    expect(parseRemovalContact(' Tobi@Example.com ')).toBe('tobi@example.com');
    expect(parseRemovalContact('08031234567')).toBe('+2348031234567');
    expect(parseRemovalContact('call me')).toBeNull();
    expect(parseRemovalContact(null)).toBeNull();
  });
  it('trims and caps the note', () => {
    expect(parseRemovalNote('  a   b ')).toBe('a b');
    expect(parseRemovalNote('x'.repeat(900))?.length).toBe(500);
    expect(parseRemovalNote('   ')).toBeNull();
  });
});

describe('creditCountsForProfile', () => {
  it('needs all three: attested, not hidden, delivered', () => {
    expect(creditCountsForProfile({ confirmedAccurate: true, personHidden: false, delivered: true })).toBe(true);
    expect(creditCountsForProfile({ confirmedAccurate: false, personHidden: false, delivered: true })).toBe(false);
    expect(creditCountsForProfile({ confirmedAccurate: true, personHidden: true, delivered: true })).toBe(false);
    expect(creditCountsForProfile({ confirmedAccurate: true, personHidden: false, delivered: false })).toBe(false);
  });
});
