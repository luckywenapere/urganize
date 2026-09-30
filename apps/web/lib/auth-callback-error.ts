// The Google sign-in callback (`/auth/callback`) sends a person back to
// `/auth?error=<code>` when it cannot finish. Nothing on `/auth` read that
// parameter, so a failed sign-in landed on a clean login form with no message
// and no clue what to do. Each known code maps to one plain sentence that names
// a way forward; an unknown or missing code shows nothing rather than a guess.
const MESSAGES: Record<string, string> = {
  callback_timeout: 'Google sign-in took too long to finish. Try again, or use your email.',
  callback_no_session: 'Google sign-in did not finish. Try again, or use your email.',
  callback_failed: 'Google sign-in did not work this time. Try again, or use your email.',
};

export function describeCallbackError(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(MESSAGES, code) ? MESSAGES[code] : null;
}
