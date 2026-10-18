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
  it('matches the team by pattern, not by exact address (URG-369)', () => {
    for (const email of [
      'luckywenapere@gmail.com',
      'luckywenapere+qa@gmail.com',
      'LuckyWenapere2@yahoo.com',
      'theurganization@gmail.com',
      'theurganization.test@gmail.com',
      'tedumking@gmail.com',
      'tedumking+trial@gmail.com',
      'ugorjigideon@outlook.com',
      'ugorjigideon1@gmail.com',
      'clebmichael@gmail.com',
      'clebmichael+x@icloud.com',
      'anyone@urganize.app',
    ]) {
      expect(isInternalAccountEmail(email), email).toBe(true);
    }
    // A prefix only counts at the START of the name part, never in the domain.
    expect(isInternalAccountEmail('fan.tedumking@gmail.com')).toBe(false);
    expect(isInternalAccountEmail('manager@tedumking.com')).toBe(false);
    expect(isInternalAccountEmail('gideon@ugorjigideon.com')).toBe(false);
  });
  it('a set answers for aliases of its extra addresses', () => {
    const set = new InternalEmailSet(['ops@example.com']);
    expect(set.has('ops+qa@example.com')).toBe(true);
    expect(set.has('luckydio10+x@gmail.com')).toBe(true);
    expect(set.has('other@example.com')).toBe(false);
  });
});
