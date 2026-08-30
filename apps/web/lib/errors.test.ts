import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

/**
 * `errorMessage` is load-bearing for a DIAGNOSTIC path, not just for copy.
 *
 * `GET /api/command-center` reports a failure with it, and the case that
 * matters there is the third one below: a raw PostgREST error object. Supabase
 * rejects with `{ message, code, details, hint }` — a plain object, NOT an
 * Error instance — and the ~25 `throw result.error` call sites reachable from
 * that route throw it unwrapped. An `instanceof Error` check answers false for
 * every one of them, which is exactly how a real failure once reached a user
 * as a bare "Internal Server Error" with its cause thrown away.
 *
 * So the object-shape case is the regression guard: if someone narrows this
 * back to Errors and strings, that route goes blind again.
 */
describe('errorMessage', () => {
  it('reads an Error instance', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('reads a thrown string', () => {
    expect(errorMessage('boom', 'fallback')).toBe('boom');
  });

  it('reads a raw PostgREST error object, which is not an Error', () => {
    const postgrestError = {
      message: 'column releases.foo does not exist',
      code: '42703',
      details: null,
      hint: null,
    };

    expect(postgrestError).not.toBeInstanceOf(Error);
    expect(errorMessage(postgrestError, 'Internal Server Error')).toBe(
      'column releases.foo does not exist'
    );
  });

  it('falls back when a value carries no usable message', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    expect(errorMessage({}, 'fallback')).toBe('fallback');
    expect(errorMessage({ code: '42703' }, 'fallback')).toBe('fallback');
    expect(errorMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });

  it('falls back on an empty message rather than reporting nothing', () => {
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(errorMessage('', 'fallback')).toBe('fallback');
    expect(errorMessage({ message: '' }, 'fallback')).toBe('fallback');
  });
});
