import { describe, expect, it } from 'vitest';

import {
  classifyAuthFailure,
  isAbortError,
  isProfileReadTransientError,
  shouldClearPersistedSession,
  type AuthFailureKind,
} from './auth-failure';

// Every case is a PLAIN OBJECT, never a real error instance. The point of this
// module is that it matches shapes, not classes: pnpm can hoist two copies of
// @supabase/auth-js, and a prod build mangles class names, so `instanceof`
// would silently stop working in exactly the environment that matters. Testing
// with literals is what pins that contract.

type Case = {
  readonly label: string;
  readonly error: unknown;
  readonly expected: AuthFailureKind;
};

const cases: readonly Case[] = [
  // --- the server answered, and the answer was "no" ---
  {
    label: 'AuthSessionMissingError',
    error: {
      __isAuthError: true,
      name: 'AuthSessionMissingError',
      status: 400,
      message: 'Auth session missing!',
    },
    expected: 'revoked',
  },
  {
    label: 'AuthInvalidJwtError',
    error: { __isAuthError: true, name: 'AuthInvalidJwtError', message: 'Invalid JWT structure' },
    expected: 'revoked',
  },
  {
    label: 'AuthApiError 401',
    error: {
      __isAuthError: true,
      name: 'AuthApiError',
      status: 401,
      message: 'invalid claim: missing sub claim',
    },
    expected: 'revoked',
  },
  {
    label: 'AuthApiError 403 user_banned',
    error: { __isAuthError: true, name: 'AuthApiError', status: 403, code: 'user_banned' },
    expected: 'revoked',
  },
  {
    label: 'AuthApiError refresh_token_already_used (the rotation race)',
    error: {
      __isAuthError: true,
      name: 'AuthApiError',
      status: 400,
      code: 'refresh_token_already_used',
      message: 'Invalid Refresh Token: Already Used',
    },
    expected: 'revoked',
  },
  {
    label: 'AuthApiError session_not_found',
    error: { __isAuthError: true, name: 'AuthApiError', status: 404, code: 'session_not_found' },
    expected: 'revoked',
  },
  {
    label: 'AuthApiError 400 whose message names a refresh token (pre-error_code GoTrue)',
    error: {
      __isAuthError: true,
      name: 'AuthApiError',
      status: 400,
      message: 'Invalid Refresh Token: Refresh Token Not Found',
    },
    expected: 'revoked',
  },

  // --- we never got an answer ---
  {
    label: 'AuthRetryableFetchError offline (status 0)',
    error: {
      __isAuthError: true,
      name: 'AuthRetryableFetchError',
      status: 0,
      message: 'Failed to fetch',
    },
    expected: 'transient',
  },
  {
    label: 'AuthRetryableFetchError 503',
    error: { __isAuthError: true, name: 'AuthRetryableFetchError', status: 503 },
    expected: 'transient',
  },
  {
    label: 'AuthApiError 500',
    error: { __isAuthError: true, name: 'AuthApiError', status: 500, message: 'Internal error' },
    expected: 'transient',
  },
  {
    label: 'AuthApiError 429',
    error: { __isAuthError: true, name: 'AuthApiError', status: 429, message: 'rate limited' },
    expected: 'transient',
  },
  {
    label: 'stolen navigator lock',
    error: Object.assign(
      new Error('Lock "lock:sb-abcdef-auth-token" was released because another request stole it'),
      { isAcquireTimeout: true }
    ),
    expected: 'transient',
  },
  {
    // The whole helper hinges on this: LockAcquireTimeoutError never assigns
    // this.name, and NavigatorLockAcquireTimeoutError has no constructor — so
    // `name` is the useless string 'Error' and only isAcquireTimeout works.
    // If someone "tidies" the predicate into a name check, this case fails.
    label: 'lock timeout whose name is uselessly Error',
    error: { isAcquireTimeout: true, name: 'Error', message: 'Acquiring lock timed out' },
    expected: 'transient',
  },
  {
    label: 'TypeError: Failed to fetch (Chromium)',
    error: new TypeError('Failed to fetch'),
    expected: 'transient',
  },
  {
    label: 'TypeError: Load failed (Safari)',
    error: new TypeError('Load failed'),
    expected: 'transient',
  },
  {
    label: 'AbortError',
    error: Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    expected: 'transient',
  },

  // --- not recognised, so preserved ---
  { label: 'undefined', error: undefined, expected: 'unknown' },
  { label: 'null', error: null, expected: 'unknown' },
  { label: 'a bare string', error: 'something went wrong', expected: 'unknown' },
  { label: 'an empty object', error: {}, expected: 'unknown' },
  {
    label: 'AuthApiError 418 (a status we have no rule for)',
    error: { __isAuthError: true, name: 'AuthApiError', status: 418, message: 'teapot' },
    expected: 'unknown',
  },
  {
    label: 'an auth error whose name we do not know',
    error: { __isAuthError: true, name: 'AuthWeirdNewError', message: 'hello' },
    expected: 'unknown',
  },
];

describe('classifyAuthFailure', () => {
  for (const { label, error, expected } of cases) {
    it(`${label} → ${expected}`, () => {
      expect(classifyAuthFailure(error)).toBe(expected);
    });
  }

  it('treats anything as transient when the browser reports being offline', () => {
    expect(classifyAuthFailure(new Error('who knows'), { online: false })).toBe('transient');
    expect(classifyAuthFailure({}, { online: false })).toBe('transient');
  });

  it('still trusts an explicit server answer while offline', () => {
    // navigator.onLine is a hint about the local radio, not about a response we
    // already hold. A 401 in hand outranks it.
    expect(
      classifyAuthFailure(
        { __isAuthError: true, name: 'AuthApiError', status: 401, message: 'bad jwt' },
        { online: false }
      )
    ).toBe('revoked');
  });
});

describe('shouldClearPersistedSession', () => {
  // Positive control. Without at least one `true` here, a predicate that
  // returned false unconditionally would pass every other assertion in this
  // file. Same guard as the one in lib/schema-fallback-guard.test.ts.
  it('clears the session when the server says it is gone', () => {
    expect(
      shouldClearPersistedSession({
        __isAuthError: true,
        name: 'AuthSessionMissingError',
        status: 400,
      })
    ).toBe(true);
    expect(
      shouldClearPersistedSession({ __isAuthError: true, name: 'AuthApiError', status: 401 })
    ).toBe(true);
  });

  it('keeps the session for everything we could not confirm', () => {
    const preserved = cases.filter((entry) => entry.expected !== 'revoked');
    // Guards against the list above quietly losing all its non-revoked cases.
    expect(preserved.length).toBeGreaterThan(10);
    for (const { label, error } of preserved) {
      expect(shouldClearPersistedSession(error), label).toBe(false);
    }
  });
});

describe('isAbortError', () => {
  it('matches by name and by message', () => {
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isAbortError(new Error('The operation was aborted'))).toBe(true);
  });

  it('does not match unrelated failures', () => {
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe('isProfileReadTransientError', () => {
  it('matches the shape postgrest-js resolves with on a network failure', () => {
    // Verified against postgrest-js: it RESOLVES (never rejects) with an empty
    // `code`, which is what used to slip past auth-store's PGRST116 guard and
    // get thrown, logging out a validly-authenticated user.
    expect(
      isProfileReadTransientError({
        code: '',
        message: 'TypeError: Failed to fetch',
        details: 'Network request failed',
        hint: '',
      })
    ).toBe(true);
  });

  it('does not match a real database answer', () => {
    expect(
      isProfileReadTransientError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
    ).toBe(false);
    expect(
      isProfileReadTransientError({ code: '42501', message: 'permission denied for table profiles' })
    ).toBe(false);
  });

  it('never treats a profile read as evidence about the session', () => {
    // A profiles row is application data. No answer from that table — not even
    // a permission error — should clear someone's session.
    expect(
      shouldClearPersistedSession({ code: '42501', message: 'permission denied for table profiles' })
    ).toBe(false);
    expect(shouldClearPersistedSession({ code: '', message: 'TypeError: Failed to fetch' })).toBe(
      false
    );
  });
});
