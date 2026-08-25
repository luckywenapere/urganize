/**
 * Telling "the network is down" apart from "the server said no".
 *
 * WHY THIS EXISTS: `checkAuth` (lib/auth-store.ts) used to treat any
 * `supabase.auth.getUser()` failure — including a plain dropped connection —
 * as "definitely not authenticated" and sign the user out visually, even
 * though their session was still valid and simply couldn't be re-confirmed
 * right now. A real auth rejection (expired refresh token, revoked session,
 * a 401 from GoTrue) must still sign out; only the "we couldn't ask" case
 * should not. This is the single classifier both branches consult, so they
 * can't drift into different definitions of "offline".
 *
 * Deliberately an allowlist of known network-failure shapes rather than a
 * denylist of known auth-failure shapes: supabase-js, fetch, and the
 * browser itself each spell "no response at all" differently, and a
 * denylist would need to anticipate every real rejection reason instead of
 * every way a request can simply never leave the device.
 *
 * Mirrors the classification lib/upload-failure-report.ts already uses for
 * `'Failed to fetch'` / `'NetworkError…'` — kept as a separate module rather
 * than imported from there because that file's `classifyUploadFailure` is
 * scoped to upload telemetry (it also emits non-network classes like
 * `too_large`, `forbidden`) and pulling this one predicate out of it would
 * couple an auth-path decision to an upload-reporting module for no reason.
 */

const NETWORK_ERROR_NAMES = new Set([
  'authretryablefetcherror', // supabase-js: getUser()/getSession() couldn't reach GoTrue
  'networkerror',
  'typeerror', // the browser's own name for a fetch that never got a response
]);

const NETWORK_ERROR_MESSAGE_FRAGMENTS = [
  'failed to fetch',
  'networkerror',
  'network request failed', // React Native / some mobile webviews
  'load failed', // Safari's fetch rejection message
  'the internet connection appears to be offline',
];

/**
 * True when `error` looks like "the request never reached the server",
 * false when it looks like a real rejection (invalid credentials, expired
 * token, a 4xx/5xx response body, an intentional abort).
 *
 * Never throws — an error shaped nothing like an Error is just "not a
 * network failure", which is the safer default (a genuinely ambiguous
 * error should still sign out rather than silently trust a stale session).
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!error) return false;

  const name = String((error as { name?: string } | null | undefined)?.name || '').toLowerCase();
  if (NETWORK_ERROR_NAMES.has(name)) {
    // TypeError is also the JS name for plenty of ordinary bugs (reading a
    // property of undefined), so only trust it alongside a matching message.
    if (name !== 'typeerror') return true;
  }

  const message = String(
    (error as { message?: string } | null | undefined)?.message ?? error
  ).toLowerCase();
  if (!message) return false;

  return NETWORK_ERROR_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
}
