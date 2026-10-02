import { createHmac, timingSafeEqual } from 'node:crypto';
import { URGANS_PASS_HEADER } from './urgans-pass-header';

/**
 * The UrgAns pass: how a credits-only team's assistant is allowed to act.
 *
 * A team that is walled (its trial ended) or read-only (its plan lapsed) is
 * refused by the paywall gate on the routes UrgAns's own tools call: every one
 * is a plain REST route behind `requireActiveAuthenticatedUser`. The founder's
 * rule (2026-10-02) is that such a team can still use UrgAns, changes included,
 * paying in credits. So the chat route, once it has checked that the team is
 * credits-only and holds credits, MINTS a pass and attaches it to the internal
 * calls its tools make. The gate accepts a valid pass for the same user and
 * skips the paywall check for that one request.
 *
 * WHAT MAKES THIS SAFE, and what a later change must not weaken:
 *   - Only the server can mint one. It is an HMAC over the user id and an expiry,
 *     keyed from a server-only secret, so a browser that sees the header name
 *     still cannot make a valid value.
 *   - It names ONE user. A pass minted for one account does nothing for another,
 *     and the gate checks it against the user the bearer token resolves to.
 *   - It is short-lived. A turn runs for under a minute; the pass lasts three.
 *   - It only ever bypasses the PAYWALL. Authentication, the curator block,
 *     ownership and team-access checks, tier caps and every route's own rules
 *     still apply, because the gate simply skips one call.
 *   - It is minted only for an account the credit rules call credits-only and
 *     only when it holds credits, and that spend is metered like any other turn.
 *
 * Pure and takes the secret as an argument, so it is tested without the
 * environment. The server-side reader is in urgans-pass-server.ts.
 */

export { URGANS_PASS_HEADER };

/** How long a pass is good for. */
export const URGANS_PASS_TTL_MS = 3 * 60 * 1000;

const LABEL = 'urgans-pass:v1';

const sign = (secret: string, userId: string, expiresAtMs: number): string =>
  createHmac('sha256', secret).update(`${LABEL}:${userId}:${expiresAtMs}`).digest('hex');

/** `<expiry ms>.<signature>`. Empty when there is no secret or no user, so a
 *  misconfigured server never hands out something that looks valid. */
export function mintUrgansPass(secret: string | null, userId: string, now: number = Date.now()): string {
  if (!secret || !userId) return '';
  const expiresAt = now + URGANS_PASS_TTL_MS;
  return `${expiresAt}.${sign(secret, userId, expiresAt)}`;
}

/** Whether a header value is a live pass for this user. Never throws. */
export function verifyUrgansPass(
  secret: string | null,
  header: string | null | undefined,
  userId: string,
  now: number = Date.now()
): boolean {
  if (!secret || !userId || !header) return false;
  const dot = header.indexOf('.');
  if (dot <= 0) return false;
  const expiresAt = Number(header.slice(0, dot));
  if (!Number.isFinite(expiresAt) || !Number.isInteger(expiresAt)) return false;
  if (expiresAt <= now) return false;
  // A pass can never be good for longer than it was minted for, so a far-future
  // expiry is a forged one even before the signature is checked.
  if (expiresAt > now + URGANS_PASS_TTL_MS) return false;

  const given = header.slice(dot + 1);
  const expected = sign(secret, userId, expiresAt);
  if (given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}
