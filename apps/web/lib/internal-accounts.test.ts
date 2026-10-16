import { describe, expect, it } from 'vitest';
import { InternalEmailSet, isInternalAccountEmail } from './internal-accounts';

describe('internal accounts', () => {
  it('leaves out our test inboxes and domain', () => {
    expect(isInternalAccountEmail('luckydio10+paywalltest@gmail.com')).toBe(true);
    expect(isInternalAccountEmail('LuckyDio10+flowtest1011c@gmail.com')).toBe(true);
    expect(isInternalAccountEmail('luckydio10.paywalltest@gmail.com')).toBe(true);
    expect(isInternalAccountEmail('someone@urganize.app')).toBe(true);
    expect(isInternalAccountEmail('luckydio100@gmail.com')).toBe(true);
    expect(isInternalAccountEmail('LUCKYDIO.qa@yahoo.com')).toBe(true);
  });
  it('keeps customers', () => {
    expect(isInternalAccountEmail('manager@gmail.com')).toBe(false);
    expect(isInternalAccountEmail('manager+label@gmail.com')).toBe(false);
    expect(isInternalAccountEmail(null)).toBe(false);
    expect(isInternalAccountEmail('fan@luckydio.com')).toBe(false);
  });
  it('a set answers for aliases of its extra addresses', () => {
    const set = new InternalEmailSet(['ops@example.com']);
    expect(set.has('ops+qa@example.com')).toBe(true);
    expect(set.has('luckydio10+x@gmail.com')).toBe(true);
    expect(set.has('other@example.com')).toBe(false);
  });
});
