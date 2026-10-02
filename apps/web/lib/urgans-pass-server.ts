import { createHmac } from 'node:crypto';
import { URGANS_PASS_HEADER, mintUrgansPass, verifyUrgansPass } from './urgans-pass';

/**
 * The server's half of the UrgAns pass: where the secret comes from, and the two
 * calls the rest of the app makes. See urgans-pass.ts for what a pass is and why
 * it is safe.
 *
 * The secret is DERIVED from the service-role key rather than being a new
 * environment variable to remember: that key is already server-only and already
 * a secret, and hashing it under a fixed label means the pass key is not the key
 * itself and cannot be turned back into it. No key, no pass: both calls answer
 * "no" rather than throwing.
 */

const SECRET_LABEL = 'urgans-pass-secret:v1';

function passSecret(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  return createHmac('sha256', key).update(SECRET_LABEL).digest('hex');
}

/** A pass for this user, or '' when the server cannot make one. */
export function mintPassForUser(userId: string): string {
  return mintUrgansPass(passSecret(), userId);
}

/** Whether this request carries a live pass for this user. */
export function requestHasUrgansPass(request: { headers: { get(name: string): string | null } }, userId: string): boolean {
  return verifyUrgansPass(passSecret(), request.headers.get(URGANS_PASS_HEADER), userId);
}
