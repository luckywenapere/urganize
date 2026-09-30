import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_LENGTH_HINT,
  PASSWORD_TOO_SHORT_ERROR,
  isPasswordLongEnough,
} from './password-rules';

describe('the password rule', () => {
  it('is 8, which is what the reset page and Settings already demanded', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('refuses one character short and accepts the minimum exactly', () => {
    expect(isPasswordLongEnough('1234567')).toBe(false);
    expect(isPasswordLongEnough('12345678')).toBe(true);
    expect(isPasswordLongEnough('123456789')).toBe(true);
  });

  it('refuses the old 6-character minimum', () => {
    expect(isPasswordLongEnough('abcdef')).toBe(false);
  });

  it('refuses an empty password', () => {
    expect(isPasswordLongEnough('')).toBe(false);
  });

  it('counts a space as a character and does not trim', () => {
    // Spaces are real password characters; trimming would silently change what
    // the person typed and so what they would have to type to sign in.
    expect(isPasswordLongEnough('a       ')).toBe(true);
    expect(isPasswordLongEnough('abcdefg ')).toBe(true);
  });
});

describe('the password copy', () => {
  it('names the same number as the rule', () => {
    expect(PASSWORD_LENGTH_HINT).toContain(String(MIN_PASSWORD_LENGTH));
    expect(PASSWORD_TOO_SHORT_ERROR).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('reads the way the messages it replaced did', () => {
    expect(PASSWORD_LENGTH_HINT).toBe('At least 8 characters.');
    expect(PASSWORD_TOO_SHORT_ERROR).toBe('Password must be at least 8 characters');
  });

  it('has no em dash', () => {
    expect(PASSWORD_LENGTH_HINT + PASSWORD_TOO_SHORT_ERROR).not.toMatch(/—|–/);
  });
});
