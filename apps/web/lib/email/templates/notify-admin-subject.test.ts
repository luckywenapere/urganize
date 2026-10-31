import { describe, expect, it } from 'vitest';
import { notifyAdminSubject } from './NotifyAdminEmail';

describe('notifyAdminSubject', () => {
  it('keeps the wall wording when no ask is given', () => {
    expect(notifyAdminSubject('Bo', 'T')).toBe('Bo is waiting on T in Urganize');
  });

  it('asks for Manager when it comes from the Distribute card', () => {
    expect(notifyAdminSubject('Bo', 'T', 'distribute')).toBe('Bo asked you to move T to Pro');
    expect(notifyAdminSubject('', null, 'distribute')).toBe('A teammate asked you to move your team to Pro');
  });
});
