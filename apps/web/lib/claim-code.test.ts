import { describe, expect, it } from 'vitest';
import { CLAIM_CODE_WINDOW_MS, makeClaimCode, parseClaimCode, verifyClaimCode } from './claim-code';

const base = { secret: 's3cret', token: 'tok_abc', email: 'tobi@label.com' };
const t0 = 1_760_000_000_000;

describe('claim codes', () => {
  it('are six digits', () => {
    expect(makeClaimCode({ ...base, nowMs: t0 })).toMatch(/^\d{6}$/);
  });
  it('verify for the same token, address and window', () => {
    const code = makeClaimCode({ ...base, nowMs: t0 });
    expect(verifyClaimCode({ ...base, code, nowMs: t0 })).toBe(true);
  });
  it('ignore case and spacing in the address and the code', () => {
    const code = makeClaimCode({ ...base, nowMs: t0 });
    expect(verifyClaimCode({ ...base, email: ' TOBI@label.com ', code: `${code.slice(0, 3)} ${code.slice(3)}`, nowMs: t0 })).toBe(true);
  });
  it('still work in the next window, not the one after', () => {
    const code = makeClaimCode({ ...base, nowMs: t0 });
    expect(verifyClaimCode({ ...base, code, nowMs: t0 + CLAIM_CODE_WINDOW_MS })).toBe(true);
    expect(verifyClaimCode({ ...base, code, nowMs: t0 + 2 * CLAIM_CODE_WINDOW_MS + 1 })).toBe(false);
  });
  it('do not carry to another link, address or secret', () => {
    const code = makeClaimCode({ ...base, nowMs: t0 });
    expect(verifyClaimCode({ ...base, token: 'tok_other', code, nowMs: t0 })).toBe(false);
    expect(verifyClaimCode({ ...base, email: 'someone@else.com', code, nowMs: t0 })).toBe(false);
    expect(verifyClaimCode({ ...base, secret: 'other', code, nowMs: t0 })).toBe(false);
  });
  it('refuse a missing secret and anything that is not six digits', () => {
    const code = makeClaimCode({ ...base, nowMs: t0 });
    expect(verifyClaimCode({ ...base, secret: '', code, nowMs: t0 })).toBe(false);
    expect(parseClaimCode('12345')).toBeNull();
    expect(parseClaimCode('1234567')).toBeNull();
    expect(parseClaimCode('12a456')).toBeNull();
    expect(parseClaimCode(123456)).toBeNull();
    expect(parseClaimCode('123 456')).toBe('123456');
  });
});
