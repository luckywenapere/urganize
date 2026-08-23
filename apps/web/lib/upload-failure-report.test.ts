import { describe, expect, it } from 'vitest';
import {
  buildUploadFailureReport,
  classifyUploadFailure,
  formatUploadFailureCode,
} from './upload-failure-report';

describe('classifyUploadFailure', () => {
  it('classifies the statuses these routes actually return', () => {
    expect(classifyUploadFailure({ status: 401 })).toBe('unauthorized');
    expect(classifyUploadFailure({ status: 403 })).toBe('forbidden');
    expect(classifyUploadFailure({ status: 404 })).toBe('not_found');
    expect(classifyUploadFailure({ status: 413 })).toBe('too_large');
    expect(classifyUploadFailure({ status: 429 })).toBe('rate_limited');
    expect(classifyUploadFailure({ status: 400 })).toBe('rejected');
    expect(classifyUploadFailure({ status: 500 })).toBe('server_error');
    expect(classifyUploadFailure({ status: 503 })).toBe('server_error');
  });

  it('distinguishes a dropped connection, which is the useful one', () => {
    expect(classifyUploadFailure({ message: 'Failed to fetch' })).toBe('network');
    expect(classifyUploadFailure({ message: 'NetworkError when attempting to fetch' })).toBe(
      'network'
    );
  });

  it('recognises an expired session and an abort', () => {
    expect(classifyUploadFailure({ message: 'Session expired. Please sign in again.' })).toBe(
      'session_expired'
    );
    expect(classifyUploadFailure({ message: 'The operation was aborted' })).toBe('aborted');
  });

  it('falls back to unknown rather than echoing the message', () => {
    expect(classifyUploadFailure({})).toBe('unknown');
    expect(classifyUploadFailure({ message: '' })).toBe('unknown');
    expect(classifyUploadFailure({ message: 'something weird happened' })).toBe('unknown');
  });

  /**
   * The whole reason this is an allowlist. An upload error can carry the user's
   * file name (often their artist name) or a signed Storage URL, which is a live
   * credential for an hour. Neither may reach analytics.
   */
  it('never echoes a file name or a signed URL', () => {
    const nasty =
      'Storage upload failed for Tems - Free Mind FINAL.png at ' +
      'https://abc.supabase.co/storage/v1/object/sign/release-assets/x?token=eyJhbGciOi';
    const reason = classifyUploadFailure({ message: nasty });
    expect(reason).toBe('unknown');
    expect(reason).not.toContain('Tems');
    expect(reason).not.toContain('supabase');
    expect(reason).not.toContain('token');
    expect(reason).not.toContain('.png');
  });

  it('prefers the status over the message when both are present', () => {
    expect(classifyUploadFailure({ status: 403, message: 'Failed to fetch' })).toBe('forbidden');
  });
});

describe('buildUploadFailureReport', () => {
  it('carries surface, step and status', () => {
    expect(
      buildUploadFailureReport({ surface: 'workspace_logo', step: 2, status: 403 })
    ).toEqual({ surface: 'workspace_logo', step: 2, status: 403, reason: 'forbidden' });
  });

  it('omits status entirely when there was no response', () => {
    const report = buildUploadFailureReport({
      surface: 'curator_photo',
      step: 1,
      message: 'Failed to fetch',
    });
    expect(report).toEqual({ surface: 'curator_photo', step: 1, reason: 'network' });
    expect('status' in report).toBe(false);
  });

  it('ignores a zero or nonsense status rather than reporting it', () => {
    expect(buildUploadFailureReport({ surface: 'curator_photo', step: 3, status: 0 })).toEqual({
      surface: 'curator_photo',
      step: 3,
      reason: 'unknown',
    });
  });

  it('bounds the reason length', () => {
    const report = buildUploadFailureReport({
      surface: 'workspace_logo',
      step: 3,
      message: 'x'.repeat(500),
    });
    expect(report.reason.length).toBeLessThanOrEqual(60);
  });
});

describe('formatUploadFailureCode', () => {
  it('names the surface, the step and the status', () => {
    expect(
      formatUploadFailureCode({ surface: 'workspace_logo', step: 3, status: 400 })
    ).toBe('LOGO-3-400');
    expect(
      formatUploadFailureCode({ surface: 'curator_photo', step: 2, status: 403 })
    ).toBe('PHOTO-2-403');
  });

  it('says NET when there was no response at all', () => {
    // A genuinely different diagnosis from any HTTP status, and the most likely
    // one on a weak connection.
    expect(formatUploadFailureCode({ surface: 'curator_photo', step: 2 })).toBe('PHOTO-2-NET');
    expect(
      formatUploadFailureCode({ surface: 'workspace_logo', step: 1, status: 0 })
    ).toBe('LOGO-1-NET');
    expect(
      formatUploadFailureCode({ surface: 'workspace_logo', step: 1, status: null })
    ).toBe('LOGO-1-NET');
  });

  /**
   * This string is designed to be pasted into a chat or screenshotted, so it
   * must be safe to paste into a chat: no file name, no signed URL, no token.
   */
  it('is short and carries nothing sensitive', () => {
    for (const surface of ['workspace_logo', 'curator_photo'] as const) {
      for (const step of [1, 2, 3] as const) {
        const code = formatUploadFailureCode({ surface, step, status: 500 });
        expect(code.length).toBeLessThanOrEqual(12);
        expect(code).toMatch(/^(LOGO|PHOTO)-[123]-(\d{3}|NET)$/);
      }
    }
  });
});
