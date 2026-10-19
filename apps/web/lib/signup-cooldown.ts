// Kept apart from lib/email-confirmation.ts so the auth store can use it
// without pulling the onboarding draft code onto its chain.
/** Supabase's per-address cooldown on sign-up ("For security purposes, you can
 *  only request this after 4 seconds."): a link for this address was sent
 *  seconds ago. Not the project-wide hourly email cap, which says "rate limit". */
export function isRecentSignupCooldown(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : '';
  return /only request this after \d+ seconds?/i.test(message);
}
