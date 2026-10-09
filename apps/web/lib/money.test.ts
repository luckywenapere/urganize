import { describe, expect, it } from 'vitest';
import { formatNaira, koboToPlainNaira, nairaToKobo } from './money';

// The two doors between what a person types or reads (naira) and what is stored
// (kobo). The cases for formatNaira and nairaToKobo came over from
// lib/pitch-payments.test.ts when they moved here.

describe('formatNaira', () => {
  it('prints whole naira with thousands separators and no decimals', () => {
    expect(formatNaira(500_000)).toBe('₦5,000');
    expect(formatNaira(1_500_000)).toBe('₦15,000');
    expect(formatNaira(32_500)).toBe('₦325');
  });

  it('keeps kobo when there are some', () => {
    expect(formatNaira(500_050)).toBe('₦5,000.50');
  });

  it('never prints a negative or a non-number', () => {
    expect(formatNaira(-100)).toBe('₦0');
    expect(formatNaira(Number.NaN)).toBe('₦0');
  });

  it('shows a large amount with commas, the way the brief asks', () => {
    expect(formatNaira(123_456_700)).toBe('₦1,234,567');
  });
});

describe('nairaToKobo', () => {
  it('reads what a person types into an amount field', () => {
    expect(nairaToKobo('5000')).toBe(500_000);
    expect(nairaToKobo('5,000')).toBe(500_000);
    expect(nairaToKobo('₦5,000')).toBe(500_000);
    expect(nairaToKobo(' 5000.5 ')).toBe(500_050);
    expect(nairaToKobo(12_000)).toBe(1_200_000);
  });

  it('refuses anything that is not a positive amount', () => {
    expect(nairaToKobo('')).toBeNull();
    expect(nairaToKobo('abc')).toBeNull();
    expect(nairaToKobo('-5')).toBeNull();
    expect(nairaToKobo('0')).toBeNull();
    expect(nairaToKobo('5.001')).toBeNull();
  });

  it('is exact on amounts a float gets wrong', () => {
    // 1.15 * 100 is 114.99999999999999 as a float; the string path never does that.
    expect(nairaToKobo('1.15')).toBe(115);
    expect(nairaToKobo('0.07')).toBe(7);
  });
});

describe('koboToPlainNaira', () => {
  it('is a bare number with no sign and no separators, so a spreadsheet can sum it', () => {
    expect(koboToPlainNaira(500_000)).toBe('5000');
    expect(koboToPlainNaira(123_456_700)).toBe('1234567');
    expect(koboToPlainNaira(500_050)).toBe('5000.50');
    expect(koboToPlainNaira(500_005)).toBe('5000.05');
  });

  it('writes one kobo exactly, not as a float', () => {
    expect(koboToPlainNaira(1)).toBe('0.01');
    expect(koboToPlainNaira(10)).toBe('0.10');
  });

  it('allows zero, since a payback of nothing is a real answer', () => {
    expect(koboToPlainNaira(0)).toBe('0');
  });

  it('is a blank cell for a negative or a non-number, never a made-up zero', () => {
    expect(koboToPlainNaira(-1)).toBe('');
    expect(koboToPlainNaira(Number.NaN)).toBe('');
    expect(koboToPlainNaira(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('round-trips with nairaToKobo for every amount a person can type', () => {
    for (const typed of ['1', '12', '1234.5', '0.01', '99999.99', '100000']) {
      const kobo = nairaToKobo(typed) as number;
      expect(nairaToKobo(koboToPlainNaira(kobo))).toBe(kobo);
    }
  });
});
