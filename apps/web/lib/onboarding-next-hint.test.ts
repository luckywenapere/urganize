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

describe('describeNextBlocker with the password length (desktop sign-up, #1229)', () => {
  it('counts the characters still needed', () => {
    expect(describeNextBlocker({ ...ready, passwordLongEnough: false, passwordLength: 5 })).toBe(
      `Your password needs ${MIN_PASSWORD_LENGTH - 5} more characters.`
    );
  });

  it('says one character, not one characters', () => {
    expect(
      describeNextBlocker({ ...ready, passwordLongEnough: false, passwordLength: MIN_PASSWORD_LENGTH - 1 })
    ).toBe('Your password needs 1 more character.');
  });

  it('asks for a password when the field is empty', () => {
    expect(describeNextBlocker({ ...ready, passwordLongEnough: false, passwordLength: 0 })).toBe('Add a password.');
  });

  it('still names the name and email first', () => {
    expect(describeNextBlocker({ hasName: false, hasEmail: true, passwordLongEnough: false, passwordLength: 3 })).toBe(
      'Add your name.'
    );
  });

  it('says nothing once the password is long enough', () => {
    expect(describeNextBlocker({ ...ready, passwordLength: MIN_PASSWORD_LENGTH })).toBe('');
  });
});
