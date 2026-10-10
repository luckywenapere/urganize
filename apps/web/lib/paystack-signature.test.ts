import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { validatePaystackSignature } from '@/lib/paystack-signature';

/**
 * The Paystack webhook signature check (2026-10-09, v1.92.13).
 *
 * The old check compared the length of two HEX STRINGS and then built buffers
 * from them. A forged signature of the right length that is not hex ("zzzz...")
 * decodes to an empty buffer, and `timingSafeEqual` throws a RangeError on
 * buffers of different byte length, which surfaced as a 500 from the money
 * webhook instead of a clean 401. These tests pin that nothing a caller can
 * send makes the check throw.
 */

const SECRET = 'sk_test_secret';
const BODY = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_1' } });

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

describe('validatePaystackSignature', () => {
  it('accepts the signature Paystack would send', () => {
    expect(validatePaystackSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(validatePaystackSignature(BODY, sign(BODY, 'other'), SECRET)).toBe(false);
  });

  it('rejects a signature for a different body', () => {
    expect(validatePaystackSignature(BODY, sign(`${BODY} `), SECRET)).toBe(false);
  });

  it('rejects a missing or empty signature', () => {
    expect(validatePaystackSignature(BODY, null, SECRET)).toBe(false);
    expect(validatePaystackSignature(BODY, '', SECRET)).toBe(false);
  });

  it('rejects a signature of the right length that is not hex, without throwing', () => {
    const forged = 'z'.repeat(128);
    expect(forged).toHaveLength(sign(BODY).length);
    expect(() => validatePaystackSignature(BODY, forged, SECRET)).not.toThrow();
    expect(validatePaystackSignature(BODY, forged, SECRET)).toBe(false);
  });

  it('rejects odd-length and short hex without throwing', () => {
    for (const value of ['abc', 'a', '0', 'abcdef0', sign(BODY).slice(0, 127), sign(BODY).slice(0, 126)]) {
      expect(() => validatePaystackSignature(BODY, value, SECRET)).not.toThrow();
      expect(validatePaystackSignature(BODY, value, SECRET)).toBe(false);
    }
  });

  it('rejects a signature that is too long', () => {
    expect(validatePaystackSignature(BODY, `${sign(BODY)}00`, SECRET)).toBe(false);
  });

  it('rejects a full-length signature with junk after it, since decoding stops at the junk', () => {
    const real = sign(BODY);
    for (const tail of ['zz', 'z', ' ', '\n', 'g0']) {
      expect(() => validatePaystackSignature(BODY, `${real}${tail}`, SECRET)).not.toThrow();
      expect(validatePaystackSignature(BODY, `${real}${tail}`, SECRET)).toBe(false);
    }
  });

  it('rejects a valid signature with stray characters mixed in, without throwing', () => {
    const real = sign(BODY);
    const mixed = `${real.slice(0, 120)}zzzzzzzz`;
    expect(mixed).toHaveLength(real.length);
    expect(() => validatePaystackSignature(BODY, mixed, SECRET)).not.toThrow();
    expect(validatePaystackSignature(BODY, mixed, SECRET)).toBe(false);
  });

  it('rejects whitespace around a real signature', () => {
    expect(validatePaystackSignature(BODY, ` ${sign(BODY)}`, SECRET)).toBe(false);
    expect(validatePaystackSignature(BODY, `${sign(BODY)}\n`, SECRET)).toBe(false);
  });

  it('accepts an upper-case copy of the real signature, since hex is not case sensitive', () => {
    expect(validatePaystackSignature(BODY, sign(BODY).toUpperCase(), SECRET)).toBe(true);
  });

  it('never throws for non-ASCII input', () => {
    expect(() => validatePaystackSignature(BODY, 'é'.repeat(64), SECRET)).not.toThrow();
    expect(validatePaystackSignature(BODY, 'é'.repeat(64), SECRET)).toBe(false);
  });

  it('rejects when there is no secret to check against', () => {
    expect(validatePaystackSignature(BODY, sign(BODY, ''), '')).toBe(false);
  });
});
