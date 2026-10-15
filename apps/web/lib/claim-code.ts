import { createHmac, timingSafeEqual } from 'node:crypto';

// The six-digit code the claim flow emails to the address on a credit
// (URG-305, 2026-10-15).
//
// STATELESS ON PURPOSE. The code is an HMAC of the claim token, the address it
// was sent to and a ten-minute window, keyed with a server-only secret. Nothing
// is stored, so there is no table, no migration and no cleanup, and a code is
// useless for any other link or address. A code stays good for the window it
// was made in plus the one after, so one sent at 9:59 still works at 10:05.
//
// Wrong codes count against the invite's existing attempt limit (five lock the
// link), which is what makes a six-digit space safe to guess at.
//
// Node's crypto: server code and tests only.

export const CLAIM_CODE_LENGTH = 6;
export const CLAIM_CODE_WINDOW_MS = 10 * 60 * 1000;

const windowOf = (nowMs: number): number => Math.floor(nowMs / CLAIM_CODE_WINDOW_MS);

function codeFor(secret: string, token: string, email: string, window: number): string {
  const digest = createHmac('sha256', secret)
    .update(`claim-code:v1:${token}:${email.trim().toLowerCase()}:${window}`)
    .digest();
  // Dynamic truncation, the way TOTP does it.
  const offset = digest[digest.length - 1] & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** CLAIM_CODE_LENGTH).padStart(CLAIM_CODE_LENGTH, '0');
}

/** The code to send right now. */
export function makeClaimCode(input: { secret: string; token: string; email: string; nowMs?: number }): string {
  return codeFor(input.secret, input.token, input.email, windowOf(input.nowMs ?? Date.now()));
}

/** Digits only, exactly six, or null. */
export function parseClaimCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\s+/g, '');
  return new RegExp(`^\\d{${CLAIM_CODE_LENGTH}}$`).test(digits) ? digits : null;
}

/** Good for the current window and the one before it. */
export function verifyClaimCode(input: {
  secret: string;
  token: string;
  email: string;
  code: unknown;
  nowMs?: number;
}): boolean {
  const code = parseClaimCode(input.code);
  if (!code || !input.secret) return false;
  const now = windowOf(input.nowMs ?? Date.now());
  for (const window of [now, now - 1]) {
    const expected = Buffer.from(codeFor(input.secret, input.token, input.email, window));
    if (timingSafeEqual(expected, Buffer.from(code))) return true;
  }
  return false;
}

/** The server-only key. Null when the environment has none (local dev). */
export function readClaimCodeSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return key ? key : null;
}
