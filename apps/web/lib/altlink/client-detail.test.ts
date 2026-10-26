import { describe, expect, it, vi } from 'vitest';
import { AltlinkError, createAltlinkClient } from './client';

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const input = { title: 'T', artist_name: 'A', external_release_id: 'x', timezone: 'Africa/Lagos' };

describe('AltlinkError.detail', () => {
  it('keeps what else Altlink said about a refused request, so a failure can name the field', async () => {
    const fetchImpl = vi.fn(async () =>
      reply(400, { error: { code: 'invalid_request', message: 'Request body failed validation.', fields: { artwork_url: 'bad' } } })
    );
    const client = createAltlinkClient({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => undefined });
    const error = (await client.createLink(input).catch((e: unknown) => e)) as AltlinkError;
    expect(error).toBeInstanceOf(AltlinkError);
    expect(error.code).toBe('invalid_request');
    expect(error.message).toBe('Request body failed validation.');
    expect(error.detail).toContain('artwork_url');
  });

  it('also keeps top-level extras such as a details list', async () => {
    const fetchImpl = vi.fn(async () =>
      reply(422, { error: { code: 'invalid_request', message: 'bad' }, details: [{ path: 'upc', message: 'too short' }] })
    );
    const client = createAltlinkClient({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => undefined });
    const error = (await client.createLink(input).catch((e: unknown) => e)) as AltlinkError;
    expect(error.detail).toContain('too short');
  });

  it('is null when there is nothing more to say', async () => {
    const fetchImpl = vi.fn(async () => reply(400, { error: { code: 'invalid_request', message: 'bad' } }));
    const client = createAltlinkClient({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => undefined });
    const error = (await client.createLink(input).catch((e: unknown) => e)) as AltlinkError;
    expect(error.detail).toBeNull();
  });
});
