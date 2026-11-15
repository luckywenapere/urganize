import { describe, expect, it } from 'vitest';
import { VISITOR_CURRENCY_COOKIE, currencyFromCookieHeader, pricingCurrencyForCountry } from '@urganize/pricing';

// The marketing site's proxy writes this cookie and the page reads it before it
// paints (#1301), so the two halves must agree on its name and its values.
describe('currencyFromCookieHeader', () => {
  it('reads the currency the proxy set', () => {
    expect(currencyFromCookieHeader(`${VISITOR_CURRENCY_COOKIE}=USD`)).toBe('USD');
    expect(currencyFromCookieHeader(`theme=dark; ${VISITOR_CURRENCY_COOKIE}=NGN; other=1`)).toBe('NGN');
  });

  it('says nothing for a missing, empty or unknown value', () => {
    expect(currencyFromCookieHeader(null)).toBeNull();
    expect(currencyFromCookieHeader('')).toBeNull();
    expect(currencyFromCookieHeader('theme=dark')).toBeNull();
    expect(currencyFromCookieHeader(`${VISITOR_CURRENCY_COOKIE}=EUR`)).toBeNull();
    expect(currencyFromCookieHeader(`${VISITOR_CURRENCY_COOKIE}=usd`)).toBeNull();
  });

  it('does not match a cookie whose name only ends the same way', () => {
    expect(currencyFromCookieHeader(`x${VISITOR_CURRENCY_COOKIE}=USD`)).toBeNull();
  });

  it('round-trips what the proxy writes for a country', () => {
    expect(currencyFromCookieHeader(`${VISITOR_CURRENCY_COOKIE}=${pricingCurrencyForCountry('GB')}`)).toBe('USD');
    expect(currencyFromCookieHeader(`${VISITOR_CURRENCY_COOKIE}=${pricingCurrencyForCountry('NG')}`)).toBe('NGN');
  });
});
