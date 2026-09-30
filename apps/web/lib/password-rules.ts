/**
 * The password rule, in one place.
 *
 * Creating an account (sign-up, accepting an invite, joining as a curator),
 * resetting a password and changing one in Settings all share it. They used to
 * disagree: the first three took 6 characters and the last two demanded 8, so
 * someone could make a password and then be unable to type the same one back in
 * on the reset page (found in the 2026-09-30 interface review).
 *
 * 8 is the usual floor for a password a person chooses for themselves, and the
 * reset page and Settings already held to it, so the looser three moved up.
 *
 * Only CREATING or CHANGING a password is held to this. Signing in is not:
 * accounts made before this change can have a 6-character password, and
 * turning those people away at the login form would lock them out of their own
 * work. lib/password-rules-guard.test.ts pins both halves.
 *
 * The check is a length check and nothing more. A password is not trimmed
 * (spaces are real characters) and no mix of letters, digits or symbols is
 * demanded, which only pushes people towards predictable substitutions.
 *
 * Supabase keeps its own minimum on the server (Authentication > Providers >
 * Email). Raise it to match so the rule holds for anything that skips this
 * form; that is a dashboard setting and not something this file can do.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/** The short line under a field where someone is choosing a password. */
export const PASSWORD_LENGTH_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

/** What a failed check says. No full stop, like the messages it replaced. */
export const PASSWORD_TOO_SHORT_ERROR = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
