import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TRM_FALLBACK_STORES,
  TrmApiError,
  createTrmRelease,
  getTrmStores,
  getTrmToken,
  idempotencyKey,
  resetTrmStoresCache,
  resetTrmTokenCache,
  storesFromCapabilities,
  submitTrmRelease,
} from './client';

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let answers: Array<() => Response> = [];
const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  answers = [];
  resetTrmTokenCache();
  resetTrmStoresCache();
  process.env.TRM_CLIENT_ID = 'cid';
  process.env.TRM_CLIENT_SECRET = 'csecret';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected call ${url}`);
    return next();
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('TRM client (mocked HTTP)', () => {
  it('exchanges client credentials once and caches the token', async () => {
    answers.push(json(200, { access_token: 'tok', token_type: 'Bearer', expires_in: 3600, scope: 'releases:write' }));
    expect(await getTrmToken()).toBe('tok');
    expect(await getTrmToken()).toBe('tok');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/oauth\/token$/);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ grant_type: 'client_credentials', client_id: 'cid', client_secret: 'csecret' });
  });

  it('sends the Idempotency-Key and Bearer on writes and unwraps data', async () => {
    answers.push(json(200, { access_token: 'tok', expires_in: 3600 }), json(201, { data: { id: 'trm-1', status: 'draft' } }));
    const created = await createTrmRelease({ external_release_id: 'r1' } as never, 'urg:r1:create:abc');
    expect(created).toEqual({ id: 'trm-1', status: 'draft' });
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('urg:r1:create:abc');
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('turns TRM errors into TrmApiError with code and details', async () => {
    answers.push(json(200, { access_token: 'tok', expires_in: 3600 }), json(422, { error: { code: 'artist_not_found', message: 'No TRM artist for that email', details: [] } }));
    await expect(createTrmRelease({} as never, 'k')).rejects.toMatchObject({ status: 422, code: 'artist_not_found' });
  });

  it('re-mints the token once on a 401', async () => {
    answers.push(json(200, { access_token: 'old', expires_in: 3600 }), json(401, { error: { message: 'expired' } }), json(200, { access_token: 'new', expires_in: 3600 }), json(200, {}));
    await submitTrmRelease('trm-1', 'k2');
    expect((calls[3].init.headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('refuses to run unconfigured', async () => {
    delete process.env.TRM_CLIENT_SECRET;
    await expect(getTrmToken()).rejects.toBeInstanceOf(TrmApiError);
  });

  it('derives the same key for the same body and a new one when it changes', () => {
    expect(idempotencyKey('r1', 'create', { a: 1 })).toBe(idempotencyKey('r1', 'create', { a: 1 }));
    expect(idempotencyKey('r1', 'create', { a: 1 })).not.toBe(idempotencyKey('r1', 'create', { a: 2 }));
    expect(idempotencyKey('r1', 'create', { a: 1 }).length).toBeLessThanOrEqual(191);
  });

  it('reads data.stores from capabilities and caches it for an hour', async () => {
    answers.push(json(200, { access_token: 'tok', expires_in: 3600 }), json(200, { data: { stores: ['Spotify', 'Boomplay'] } }));
    const t0 = 1_000_000;
    expect(await getTrmStores(t0)).toEqual(['Spotify', 'Boomplay']);
    expect(await getTrmStores(t0 + 59 * 60 * 1000)).toEqual(['Spotify', 'Boomplay']);
    expect(calls.filter((c) => c.url.endsWith('/capabilities'))).toHaveLength(1);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('falls back to TRM’s exact list when capabilities fails or lists nothing', async () => {
    answers.push(json(200, { access_token: 'tok', expires_in: 3600 }), json(503, { error: { message: 'down' } }));
    expect(await getTrmStores()).toEqual([...TRM_FALLBACK_STORES]);
    answers.push(json(200, { data: { stores: [] } }));
    expect(await getTrmStores()).toEqual([...TRM_FALLBACK_STORES]);
    expect(TRM_FALLBACK_STORES).toHaveLength(21);
    expect(TRM_FALLBACK_STORES).toContain('Snap / TikTok');
  });

  it('store names: strings or {name}, never "all", no duplicates', () => {
    expect(storesFromCapabilities({ data: { stores: ['Spotify', { name: 'Tidal' }, 'all', 'Spotify', 3] } })).toEqual(['Spotify', 'Tidal']);
    expect(storesFromCapabilities({ stores: ['Deezer'] })).toEqual(['Deezer']);
    expect(storesFromCapabilities(null)).toEqual([]);
  });
});
