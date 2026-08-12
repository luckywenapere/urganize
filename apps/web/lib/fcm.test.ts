import { describe, expect, it } from 'vitest';
import { buildFcmMessage, classifyFcmError } from './fcm';

describe('buildFcmMessage', () => {
  it('maps title/body into notification and mirrors url/tag into data', () => {
    const message = buildFcmMessage('token-123', {
      title: 'Hello',
      body: 'World',
      url: '/dashboard?release=abc',
      tag: 'release-abc',
    });

    expect(message).toEqual({
      message: {
        token: 'token-123',
        notification: { title: 'Hello', body: 'World' },
        data: { url: '/dashboard?release=abc', tag: 'release-abc' },
        android: {
          notification: { tag: 'release-abc' },
          collapse_key: 'release-abc',
        },
      },
    });
  });

  it('defaults url to /dashboard and tag to empty string when omitted', () => {
    const message = buildFcmMessage('token-123', {
      title: 'Hello',
      body: 'World',
    }) as { message: { data: { url: string; tag: string }; android: Record<string, unknown> } };

    expect(message.message.data.url).toBe('/dashboard');
    expect(message.message.data.tag).toBe('');
    expect(message.message.android.notification).toEqual({ tag: undefined });
    expect(message.message.android.collapse_key).toBeUndefined();
  });
});

describe('classifyFcmError', () => {
  it('prunes on a 404 (token no longer exists)', () => {
    expect(classifyFcmError(404, null)).toBe('prune');
  });

  it('prunes on an UNREGISTERED errorCode', () => {
    const body = {
      error: {
        status: 'INVALID_ARGUMENT',
        details: [{ errorCode: 'UNREGISTERED' }],
      },
    };
    expect(classifyFcmError(400, body)).toBe('prune');
  });

  it('prunes on an INVALID_ARGUMENT errorCode', () => {
    const body = { error: { details: [{ errorCode: 'INVALID_ARGUMENT' }] } };
    expect(classifyFcmError(400, body)).toBe('prune');
  });

  it('does not prune a rate limit (429)', () => {
    expect(classifyFcmError(429, { error: { status: 'RESOURCE_EXHAUSTED' } })).toBe('other');
  });

  it('does not prune a 500 with no parseable body', () => {
    expect(classifyFcmError(500, null)).toBe('other');
  });

  it('does not prune when the error status itself is UNAVAILABLE', () => {
    expect(classifyFcmError(503, { error: { status: 'UNAVAILABLE' } })).toBe('other');
  });
});
