import { describe, expect, it } from 'vitest';
import {
  buildIdentifiers,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from './person-identity';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Tunde.O@Example.COM ')).toBe('tunde.o@example.com');
  });

  it('keeps plus tags, which are part of the address a person gave', () => {
    expect(normalizeEmail('a+b@x.com')).toBe('a+b@x.com');
  });

  it('answers null for anything that is not an address', () => {
    for (const raw of ['', '   ', 'nope', 'a@b', '@x.com', 'a@@x.com', 'a b@x.com', null, undefined, 5]) {
      expect(normalizeEmail(raw as never)).toBeNull();
    }
  });

  it('refuses an absurdly long value', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@x.com`)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('turns a local Nigerian number into the international form', () => {
    expect(normalizePhone('0803 123 4567')).toBe('+2348031234567');
  });

  it('accepts the same number written three other ways', () => {
    expect(normalizePhone('+234 803 123 4567')).toBe('+2348031234567');
    expect(normalizePhone('2348031234567')).toBe('+2348031234567');
    expect(normalizePhone('(0803) 123-4567')).toBe('+2348031234567');
  });

  it('keeps a number from another country as it was given', () => {
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
  });

  it('answers null for too few or too many digits and for junk', () => {
    for (const raw of ['', '12345', '+1234567890123456', 'call me', null, undefined]) {
      expect(normalizePhone(raw as never)).toBeNull();
    }
  });
});

describe('normalizeName', () => {
  it('ignores case, spacing and accents so the same name compares equal', () => {
    expect(normalizeName('  Tunde   Okafor ')).toBe('tunde okafor');
    expect(normalizeName('José  Álvarez')).toBe('jose alvarez');
  });

  it('answers an empty string for nothing', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(undefined as never)).toBe('');
  });
});

describe('buildIdentifiers', () => {
  it('returns each usable identifier once, email first', () => {
    expect(buildIdentifiers({ email: 'A@x.com', phone: '0803 123 4567' })).toEqual([
      { kind: 'email', value: 'a@x.com' },
      { kind: 'phone', value: '+2348031234567' },
    ]);
  });

  it('drops the ones that are not usable instead of failing', () => {
    expect(buildIdentifiers({ email: 'nope', phone: '0803 123 4567' })).toEqual([
      { kind: 'phone', value: '+2348031234567' },
    ]);
    expect(buildIdentifiers({})).toEqual([]);
  });
});
