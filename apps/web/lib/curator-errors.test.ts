import { describe, expect, it } from 'vitest';
import {
  CURATOR_NETWORK_ERROR,
  describeCuratorFailure,
  readServerMessage,
} from './curator-errors';

describe('describeCuratorFailure', () => {
  it('prefers what the server said over the status map', () => {
    expect(
      describeCuratorFailure({ status: 403, serverMessage: 'This is only for playlist owners.' })
    ).toBe('This is only for playlist owners.');
    expect(describeCuratorFailure({ status: 404, serverMessage: 'Not found.' })).toBe('Not found.');
  });

  it('trims the server message and ignores an empty one', () => {
    expect(describeCuratorFailure({ status: 500, serverMessage: '  Boom.  ' })).toBe('Boom.');
    expect(describeCuratorFailure({ status: 403, serverMessage: '   ' })).toBe(
      'This is only for playlist owners.'
    );
    expect(describeCuratorFailure({ status: 403, serverMessage: null })).toBe(
      'This is only for playlist owners.'
    );
  });

  it('maps the statuses these routes actually return', () => {
    expect(describeCuratorFailure({ status: 401 })).toMatch(/sign in again/i);
    expect(describeCuratorFailure({ status: 404 })).toMatch(/not available/i);
    expect(describeCuratorFailure({ status: 429 })).toMatch(/too many/i);
    expect(describeCuratorFailure({ status: 500 })).toMatch(/our side/i);
    expect(describeCuratorFailure({ status: 503 })).toMatch(/our side/i);
  });

  it('never returns an empty string, whatever the status', () => {
    for (const status of [0, 200, 302, 418, 599]) {
      expect(describeCuratorFailure({ status }).trim().length).toBeGreaterThan(0);
    }
  });

  it('tells someone on a dropped connection what to do about it', () => {
    expect(CURATOR_NETWORK_ERROR).toMatch(/connection/i);
    expect(CURATOR_NETWORK_ERROR).toMatch(/try again/i);
  });
});

describe('readServerMessage', () => {
  const asResponse = (body: unknown): Response =>
    ({ json: async () => body }) as Response;

  it('reads the error field', async () => {
    await expect(readServerMessage(asResponse({ error: 'Not found.' }))).resolves.toBe('Not found.');
  });

  it('returns null for a body with no usable error', async () => {
    await expect(readServerMessage(asResponse({}))).resolves.toBeNull();
    await expect(readServerMessage(asResponse({ error: '   ' }))).resolves.toBeNull();
    await expect(readServerMessage(asResponse({ error: 42 }))).resolves.toBeNull();
    await expect(readServerMessage(asResponse(null))).resolves.toBeNull();
  });

  it('survives a body that is not JSON at all', async () => {
    // A proxy's HTML error page, or an empty 502 — the case that would
    // otherwise throw inside the error handler itself.
    const broken = {
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response;
    await expect(readServerMessage(broken)).resolves.toBeNull();
  });
});
