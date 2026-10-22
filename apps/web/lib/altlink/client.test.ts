import { describe, expect, it, vi } from 'vitest';
import { AltlinkError, backoffMs, createAltlinkClient, isNotReady } from './client';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const LINK = {
  link: {
    id: 'lnk_1',
    slug: 'free-mind',
    url: 'https://altlink.co/free-mind',
    external_release_id: 'rel-1',
    type: 'pre_save',
    release_date: '2026-11-06',
    status: 'scheduled',
    claim_url: 'https://altlink.co/claim/x',
    platforms: [],
  },
};

const input = {
  title: 'Free Mind',
  artist_name: 'Tems',
  external_release_id: 'rel-1',
  upc: '123456789012',
  timezone: 'Africa/Lagos',
};

describe('createAltlinkClient', () => {
  it('sends the key as a bearer header, never in the URL', async () => {
    const fetchImpl = vi.fn(async () => json(201, LINK));
    const client = createAltlinkClient({ apiKey: 'alk_live_secret', fetchImpl, sleep: async () => {} });
    const link = await client.createLink(input);
    expect(link.url).toBe('https://altlink.co/free-mind');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.altlink.co/v1/links');
    expect(url).not.toContain('alk_live');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer alk_live_secret');
    expect(JSON.parse(init.body as string)).toMatchObject({ external_release_id: 'rel-1', timezone: 'Africa/Lagos' });
  });

  it('backs off and retries on 429, then succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'retry-after': '2' }))
      .mockResolvedValueOnce(json(429, { error: { code: 'rate_limited' } }))
      .mockResolvedValueOnce(json(201, LINK));
    const client = createAltlinkClient({ apiKey: 'k', fetchImpl, sleep });
    const link = await client.createLink(input);
    expect(link.id).toBe('lnk_1');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after four tries on 5xx', async () => {
    const fetchImpl = vi.fn(async () => json(503, { error: 'unavailable' }));
    const client = createAltlinkClient({ apiKey: 'k', fetchImpl, sleep: async () => {} });
    await expect(client.createLink(input)).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 422 missing_identifier, and reads it as not ready', async () => {
    const fetchImpl = vi.fn(async () => json(422, { error: { code: 'missing_identifier', message: 'need upc or isrc' } }));
    const client = createAltlinkClient({ apiKey: 'k', fetchImpl, sleep: async () => {} });
    const error = await client.createLink(input).catch((e) => e);
    expect(error).toBeInstanceOf(AltlinkError);
    expect(isNotReady(error)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 401, and a missing key never calls out', async () => {
    const fetchImpl = vi.fn(async () => json(401, { error: { code: 'invalid_api_key' } }));
    await expect(createAltlinkClient({ apiKey: 'k', fetchImpl, sleep: async () => {} }).getStats('lnk_1')).rejects.toMatchObject({
      code: 'invalid_api_key',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const none = vi.fn();
    await expect(createAltlinkClient({ apiKey: '', fetchImpl: none }).health()).rejects.toMatchObject({ code: 'not_configured' });
    expect(none).not.toHaveBeenCalled();
  });

  it('backoffMs grows and honours a short Retry-After', () => {
    const r = () => 0;
    expect(backoffMs(0, null, r)).toBe(500);
    expect(backoffMs(1, null, r)).toBe(1000);
    expect(backoffMs(2, null, r)).toBe(2000);
    expect(backoffMs(0, '3', r)).toBe(3000);
    expect(backoffMs(0, '120', r)).toBe(500);
  });
});
