import { describe, expect, it } from 'vitest';
import { describeNextBlocker } from './onboarding-next-hint';
import { MIN_PASSWORD_LENGTH } from './password-rules';

const ready = { hasName: true, hasEmail: true, passwordLongEnough: true };

describe('describeNextBlocker (Create your account)', () => {
  it('says nothing when nothing is in the way', () => {
    expect(describeNextBlocker(ready)).toBe('');
  });

  it('names one missing thing at a time, in the form order', () => {
    expect(describeNextBlocker({ hasName: false, hasEmail: false, passwordLongEnough: false })).toBe('Add your name.');
    expect(describeNextBlocker({ ...ready, hasEmail: false, passwordLongEnough: false })).toBe('Add your email.');
    expect(describeNextBlocker({ ...ready, passwordLongEnough: false })).toBe(
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  });
});
