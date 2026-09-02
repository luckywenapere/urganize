import { describe, expect, it } from 'vitest';
import { isNetworkFailure } from './network-error';

describe('isNetworkFailure', () => {
  it('recognizes AuthRetryableFetchError by name', () => {
    const error = { name: 'AuthRetryableFetchError', message: 'fetch failed' };
    expect(isNetworkFailure(error)).toBe(true);
  });

  it('recognizes a bare "Failed to fetch" TypeError', () => {
    const error = new TypeError('Failed to fetch');
    expect(isNetworkFailure(error)).toBe(true);
  });

  it('recognizes NetworkError by name', () => {
    expect(isNetworkFailure({ name: 'NetworkError', message: '' })).toBe(true);
  });

  it("recognizes Safari's Load failed message", () => {
    expect(isNetworkFailure(new TypeError('Load failed'))).toBe(true);
  });

  it('recognizes the offline-connection message fragment', () => {
    expect(
      isNetworkFailure(new TypeError('The Internet connection appears to be offline.'))
    ).toBe(true);
  });

  it('does NOT treat an ordinary TypeError bug as a network failure', () => {
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(
      false
    );
  });

  it('does NOT treat a real auth rejection as a network failure', () => {
    const error = { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 };
    expect(isNetworkFailure(error)).toBe(false);
  });

  it('does NOT treat an abort as a network failure', () => {
    expect(isNetworkFailure({ name: 'AbortError', message: 'The operation was aborted' })).toBe(false);
  });

  it('is false for null/undefined/empty input', () => {
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
    expect(isNetworkFailure('')).toBe(false);
  });

  it('handles a plain string error message', () => {
    expect(isNetworkFailure('Failed to fetch')).toBe(true);
    expect(isNetworkFailure('Session expired')).toBe(false);
  });

  it('never throws on a malformed error shape', () => {
    expect(() => isNetworkFailure(Symbol('weird'))).not.toThrow();
    expect(() => isNetworkFailure(42)).not.toThrow();
  });
});
