// lib/auth-failure.ts
//
// Did the server tell us this session is invalid, or did we simply fail to
// reach it?
//
// Before this module existed, lib/auth-store.ts made no distinction: every
// failure inside checkAuth wrote `isAuthenticated: false`, and because that
// flag is inside the persist middleware's `partialize` (auth-store.ts's
// `name: 'urganize-auth'` block) the answer survived reloads. So one slow
// request on a weak connection logged a user out durably, with a perfectly
// valid token still sitting in `sb-<ref>-auth-token`. The login screen is
// drawn from that flag — the pre-paint probe in app/layout.tsx and the render
// gate in app/auth/AuthPageClient.tsx both read it — so "logged out" was
// whatever the last failed network call happened to write.
//
// Pure by construction: no imports from the store, the Supabase client, or
// anything touching `window`. That is what keeps it unit-testable, since
// apps/web/vitest.config.ts collects `lib/**/*.test.ts` only and runs in a
// node environment. Callers pass `navigator.onLine` in as `opts.online`.
//
// The shapes below are matched structurally, never with `instanceof`. pnpm can
// hoist more than one copy of @supabase/auth-js, and a prod build mangles
// class names, so identity checks are not reliable here. auth-js itself agrees
// — its own `isAuthError` is exactly a `'__isAuthError' in error` test.

export type AuthFailureKind =
  /** The server answered, and the answer was "this session is not valid". */
  | 'revoked'
  /** We never got an answer: offline, 5xx, a timeout, a stolen lock. */
  | 'transient'
  /** Something we have not seen. Treated as transient — see shouldClearPersistedSession. */
  | 'unknown';

/**
 * Error codes GoTrue returns when the session itself is finished. Preferred
 * over message matching wherever present: `code` is a documented contract and
 * the message strings are not.
 */
const REVOKED_ERROR_CODES = new Set([
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'user_not_found',
  'user_banned',
]);

/** 400s whose body says "refresh token", from GoTrue builds predating `error_code`. */
const REVOKED_MESSAGE_PATTERN = /refresh.?token|invalid.?grant|already used|revoked/i;

/** Fetch failed before any response existed. Chrome says one thing, Safari another. */
const NETWORK_MESSAGE_PATTERN = /failed to fetch|load failed|network ?error|networkerror|connection/i;

const ABORT_MESSAGE_PATTERN = /aborted|operation was aborted/i;

const readString = (value: unknown, key: string): string => {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' ? raw : '';
};

const readNumber = (value: unknown, key: string): number | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'number' ? raw : null;
};

/**
 * Was the operation cancelled rather than failed? Moved here from auth-store.ts
 * so the store has one place to ask about failures.
 */
export function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (readString(error, 'name') === 'AbortError') {
    return true;
  }
  return ABORT_MESSAGE_PATTERN.test(String(readString(error, 'message')).toLowerCase());
}

/**
 * A lock-acquisition timeout from auth-js's navigatorLock.
 *
 * Test `isAcquireTimeout`, never `name`. LockAcquireTimeoutError's constructor
 * (auth-js lib/locks.js) sets `this.isAcquireTimeout = true` and never assigns
 * `this.name`, and NavigatorLockAcquireTimeoutError extends it with no
 * constructor at all — so `error.name` is the useless string 'Error'.
 * `constructor.name` is no better, because the production build mangles it.
 * This one flag is the only stable discriminator, which is exactly why auth-js
 * documents it as the supported check.
 */
const isLockAcquireTimeout = (error: unknown): boolean =>
  Boolean(error) &&
  typeof error === 'object' &&
  (error as { isAcquireTimeout?: unknown }).isAcquireTimeout === true;

/** auth-js's own test: `isAuthError` is a bare property check (lib/errors.js). */
const isSupabaseAuthError = (error: unknown): boolean =>
  Boolean(error) && typeof error === 'object' && '__isAuthError' in (error as object);

const classifyAuthApiError = (error: unknown): AuthFailureKind => {
  const code = readString(error, 'code').toLowerCase();
  if (code && REVOKED_ERROR_CODES.has(code)) {
    return 'revoked';
  }

  const status = readNumber(error, 'status');
  if (status === 401 || status === 403) {
    return 'revoked';
  }
  if (status === 400 && REVOKED_MESSAGE_PATTERN.test(readString(error, 'message'))) {
    return 'revoked';
  }
  // No status at all means the request never landed. 429 and 5xx are the
  // server declining to answer right now, which says nothing about the session.
  if (status === null || status === 0 || status === 429 || status >= 500) {
    return 'transient';
  }
  return 'unknown';
};

/**
 * Classify a failure from `supabase.auth.getUser()` / `getSession()`, or a
 * throw out of either.
 *
 * @param opts.online Caller-supplied `navigator.onLine`. Keeps this pure.
 */
export function classifyAuthFailure(
  error: unknown,
  opts?: { online?: boolean }
): AuthFailureKind {
  if (!error) {
    return 'unknown';
  }

  // Checked first: a stolen lock is thrown by the lock wrapper OUTSIDE
  // _getUser's try/catch, so it surfaces as a rejection rather than an
  // `{ error }` result, and it carries no auth-error marker at all.
  if (isLockAcquireTimeout(error)) {
    return 'transient';
  }

  if (isAbortError(error)) {
    return 'transient';
  }

  if (isSupabaseAuthError(error)) {
    const name = readString(error, 'name');
    if (name === 'AuthRetryableFetchError') {
      // Offline (status 0), 502/503/504, captive portal.
      return 'transient';
    }
    if (name === 'AuthSessionMissingError' || name === 'AuthInvalidJwtError') {
      // Honest "there is no usable token". auth-js has already removed the
      // session by the time we see this.
      return 'revoked';
    }
    if (name === 'AuthApiError') {
      return classifyAuthApiError(error);
    }
    return 'unknown';
  }

  // A bare fetch rejection: `TypeError: Failed to fetch` (Chromium),
  // `TypeError: Load failed` (Safari).
  if (
    readString(error, 'name') === 'TypeError' &&
    NETWORK_MESSAGE_PATTERN.test(readString(error, 'message'))
  ) {
    return 'transient';
  }

  // Last resort: if the browser says there is no network, nothing that just
  // failed can be evidence about the session.
  if (opts?.online === false) {
    return 'transient';
  }

  return 'unknown';
}

/**
 * The only question the auth store actually asks. Note `unknown` preserves.
 *
 * The cost matrix is asymmetric. A false logout is loud, immediate, and costs
 * the user their session. A false "still signed in" costs one wasted round
 * trip and cannot become durable: supabase-js deletes the token itself the
 * moment it is genuinely certain (firing SIGNED_OUT, which the store still
 * honours unconditionally), and the next check that does reach the server gets
 * a 401 and clears properly. So the window for an unrecognised error shape is
 * "one failed check", not "forever".
 */
export function shouldClearPersistedSession(
  error: unknown,
  opts?: { online?: boolean }
): boolean {
  return classifyAuthFailure(error, opts) === 'revoked';
}

/**
 * Did a PostgREST read of `profiles` fail for a reason that says nothing about
 * the user's identity?
 *
 * Separate from classifyAuthFailure because PostgREST errors carry no `status`
 * and no `__isAuthError`. postgrest-js resolves — does not reject — a network
 * failure as `{ code: '', message: 'TypeError: Failed to fetch', details, hint }`,
 * and that empty `code` is what used to fall through auth-store's
 * `code !== 'PGRST116'` guard and get thrown.
 *
 * Deliberately never returns "revoked" for anything: a profiles row is
 * application data, and no answer from that table is evidence about
 * authentication. See the call site in lib/auth-store.ts.
 */
export function isProfileReadTransientError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const code = readString(error, 'code');
  if (code) {
    // A real PostgREST/Postgres code means the request reached the database.
    return false;
  }
  const message = readString(error, 'message') || String(error);
  return (
    /^(TypeError|FetchError|AbortError|Error):/.test(message) ||
    NETWORK_MESSAGE_PATTERN.test(message) ||
    ABORT_MESSAGE_PATTERN.test(message)
  );
}
