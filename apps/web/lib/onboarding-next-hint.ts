/**
 * Why Create account is not ready yet, in a sentence (#854, spec S1).
 *
 * The button is disabled until the form is complete. A disabled button that
 * does not say what it is waiting for leaves a person tapping it and getting
 * nothing, on the one flow where giving up costs a whole new customer. So the
 * reason is shown beside it, one missing thing at a time, in the form's order.
 *
 * Pure, so vitest holds it. Returns '' when nothing is in the way.
 */
import { MIN_PASSWORD_LENGTH } from './password-rules';

export type AccountBlockerInput = {
  hasName: boolean;
  hasEmail: boolean;
  passwordLongEnough: boolean;
  /** Characters typed so far. Given, the line counts what is still needed
   *  ("Your password needs 3 more characters.", #1229). */
  passwordLength?: number;
};

export function describeNextBlocker(input: AccountBlockerInput): string {
  if (!input.hasName) return 'Add your name.';
  if (!input.hasEmail) return 'Add your email.';
  if (!input.passwordLongEnough) {
    if (input.passwordLength === undefined) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (input.passwordLength <= 0) return 'Add a password.';
    const left = Math.max(1, MIN_PASSWORD_LENGTH - input.passwordLength);
    return `Your password needs ${left} more ${left === 1 ? 'character' : 'characters'}.`;
  }
  return '';
}
