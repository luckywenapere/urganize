// Send to TRM server flows against TRM's official answers (Oct 19, 2026), with
// TRM's HTTP mocked and Supabase faked in memory. No real TRM call is made.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../handoff-server', () => ({ loadHandoff: vi.fn(async () => null) }));
vi.mock('../billing-events-server', () => ({ logBillingEvent: vi.fn(async () => undefined) }));
vi.mock('../distribution-server', () => ({
  workspaceIdOf: vi.fn(async () => null),
  recordDistributionRejection: vi.fn(async (_admin: unknown, input: { reasonCode: string | null; reasonText: string }) => {
    rejections.push({ code: input.reasonCode, text: input.reasonText });
    return `rej-${rejections.length}`;
  }),
}));
vi.mock('../test-release', () => ({ readTestRelease: () => false }));

import { resetTrmStoresCache, resetTrmTokenCache, TRM_FALLBACK_STORES } from './client';
import { TRM_ARTIST_NOT_FOUND_TEXT, TRM_NO_REASON } from './release';
import { applyTrmWebhook, prepareTrmDraft, reasonsFromTrmRelease, refreshFromTrm, submitToTrm } from './server';
import { readTrmEvent } from './webhook';

let rejections: Array<{ code: string | null; text: string }> = [];

// ---------------------------------------------------------------------------
// In-memory Supabase: just the chains lib/trm/server.ts uses.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  let payload: Row | null = null;
  let head = false;
  const rows = () => (tables[table] ??= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = (): { data: unknown; error: { code?: string; message: string } | null; count?: number } => {
    if (mode === 'insert') {
      const row = payload as Row;
      if (table === 'partner_webhook_deliveries' && rows().some((r) => r.delivery_id === row.delivery_id)) {
        return { data: null, error: { code: '23505', message: 'duplicate' } };
      }
      rows().push({ ...row });
      return { data: row, error: null };
    }
    if (mode === 'upsert') {
      const row = payload as Row;
      const existing = rows().find((r) => r.release_id === row.release_id && r.partner === row.partner);
      if (existing) Object.assign(existing, row);
      else rows().push({ submit_count: 0, history: [], settings: {}, ...row });
      return { data: existing ?? rows()[rows().length - 1], error: null };
    }
    if (mode === 'update') {
      matching().forEach((r) => Object.assign(r, payload));
      return { data: null, error: null };
    }
    if (mode === 'delete') {
      tables[table] = rows().filter((r) => !filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    const found = matching();
    return head ? { data: null, error: null, count: found.length } : { data: found, error: null };
  };
  const builder = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      if (mode === 'select') head = Boolean(opts?.head);
      return builder;
    },
    insert: (row: Row) => ((mode = 'insert'), (payload = row), builder),
    update: (row: Row) => ((mode = 'update'), (payload = row), builder),
    upsert: (row: Row) => ((mode = 'upsert'), (payload = row), builder),
    delete: () => ((mode = 'delete'), builder),
    eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), builder),
    in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), builder),
    not: (col: string) => (filters.push((r) => r[col] !== null && r[col] !== undefined), builder),
    is: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const result = run();
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
      return { data: data ? { ...(data as Row) } : null, error: result.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

const admin = {
  from: (table: string) => query(table),
  storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }) }) },
} as never;

// ---------------------------------------------------------------------------
// Mocked TRM HTTP
// ---------------------------------------------------------------------------
type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let routes: Array<{ match: (c: Call) => boolean; answer: (c: Call) => Response; once?: boolean }> = [];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const on = (method: string, path: RegExp, answer: (c: Call) => Response, once = false) =>
  routes.push({ match: (c) => c.method === method && path.test(c.url), answer, once });

const REL = '0b6f2c1e-1111-4222-8333-944455556666';
const TRM_ID = 'aaaaaaaa-1111-4222-8333-000000000001';
const actor = { id: 'user-1', email: 'manager@label.com' };

function seed(submission: Row | null = null) {
  tables = {
    releases: [
      {
        id: REL,
        title: 'Iyawo Mi',
        artist_name: 'Hadiza Moon',
        artist_id: 'artist-1',
        owner_user_id: 'user-1',
        release_date: '2027-01-15',
        release_type: 'single',
        artwork_asset_id: 'art-1',
        metadata: {},
      },
    ],
    release_metadata: [{ release_id: REL, genre: 'Afropop', language: 'English', explicit: false }],
    release_credit_submissions: [
      { release_id: REL, stage_name: 'Hadiza Moon', roles: ['songwriter'], master_split: null },
      { release_id: REL, stage_name: 'DJ K', roles: ['producer'], master_split: null },
    ],
    assets: [
      {
        id: 'art-1',
        mime_type: 'image/jpeg',
        metadata: { image: { width: 3000, height: 3000 } },
        file_size: 3,
        file_name: 'cover.jpg',
        storage_bucket: 'b',
        storage_path: 'p',
      },
    ],
    distribution_submissions: submission ? [{ release_id: REL, partner: 'trm', history: [], settings: {}, submit_count: 0, ...submission }] : [],
    partner_webhook_deliveries: [],
    tasks: [],
    distribution_rejections: [],
  };
}
const submission = () => tables.distribution_submissions[0] as Row & { history: Array<Row> };

beforeEach(() => {
  calls = [];
  routes = [];
  rejections = [];
  resetTrmTokenCache();
  resetTrmStoresCache();
  process.env.TRM_CLIENT_ID = 'cid';
  process.env.TRM_CLIENT_SECRET = 'csecret';
  delete process.env.TRM_SEND_ALLOWED_EMAILS;
  on('POST', /\/oauth\/token$/, () => json(200, { access_token: 'tok', expires_in: 3600 }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        method: String(init.method ?? 'GET'),
        url,
        headers: (init.headers as Record<string, string>) ?? {},
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null,
      };
      calls.push(call);
      const index = routes.findIndex((r) => r.match(call));
      if (index < 0) throw new Error(`unexpected ${call.method} ${url}`);
      const route = routes[index];
      if (route.once) routes.splice(index, 1);
      return route.answer(call);
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

const trmCalls = (method: string, path: RegExp) => calls.filter((c) => c.method === method && path.test(c.url));

describe('stores (TRM answer 1)', () => {
  const artworkRoutes = () => {
    on('POST', /\/assets\/presign$/, () => json(201, { data: { asset: { id: 'trm-art-1', type: 'artwork' }, upload: { method: 'PUT', url: 'https://r2.example/put' } } }));
    on('PUT', /r2\.example/, () => new Response(null, { status: 200 }));
    on('POST', /\/assets\/trm-art-1\/complete$/, () => json(200, {}));
  };

  it('sends the explicit store list from capabilities, never ["all"], and caches it', async () => {
    seed();
    on('GET', /\/capabilities$/, () => json(200, { data: { stores: ['Spotify', 'Apple Music', 'Boomplay'] } }));
    on('POST', /\/releases$/, () => json(201, { data: { id: TRM_ID, status: 'draft' } }));
    artworkRoutes();
    const result = await prepareTrmDraft(admin, REL, actor, { artistEmail: 'hadiza@x.com', termsAccepted: true });
    expect(result.ok).toBe(true);
    const created = trmCalls('POST', /\/releases$/)[0].body as { stores: string[] };
    expect(created.stores).toEqual(['Spotify', 'Apple Music', 'Boomplay']);
    expect(created.stores).not.toContain('all');
    // Second prepare in the hour: no second capabilities call.
    await prepareTrmDraft(admin, REL, actor, { artistEmail: 'hadiza@x.com', termsAccepted: true }).catch(() => null);
    expect(trmCalls('GET', /\/capabilities$/)).toHaveLength(1);
  });

  it('falls back to TRM’s exact list when capabilities fails', async () => {
    seed();
    on('GET', /\/capabilities$/, () => json(500, { error: { code: 'server_error', message: 'down' } }));
    on('POST', /\/releases$/, () => json(201, { data: { id: TRM_ID, status: 'draft' } }));
    artworkRoutes();
    expect((await prepareTrmDraft(admin, REL, actor, { artistEmail: 'hadiza@x.com', termsAccepted: true })).ok).toBe(true);
    const created = trmCalls('POST', /\/releases$/)[0].body as { stores: string[] };
    expect(created.stores).toEqual([...TRM_FALLBACK_STORES]);
    expect(created.stores).toContain('Facebook / Instagram');
  });

  it('a draft-time 422 that only mentions the artist is a plain error now, not needs_account', async () => {
    seed();
    on('GET', /\/capabilities$/, () => json(200, { data: { stores: ['Spotify'] } }));
    on('POST', /\/releases$/, () => json(422, { error: { code: 'validation_failed', message: 'artist_email must be an email of an artist account' } }));
    const result = await prepareTrmDraft(admin, REL, actor, { artistEmail: 'hadiza@x.com', termsAccepted: true });
    expect(result).toMatchObject({ ok: false, code: 'trm_error' });
    expect(submission().status).toBe('preparing');
  });
});

const signedAt = Math.floor(Date.now() / 1000);
const deliver = (body: unknown) => applyTrmWebhook(admin, readTrmEvent(body, {}), { headers: {}, payload: body, signedAt });
const statusChanged = (id: string, status: string, extra: Row = {}) => ({
  id,
  event: 'release.status_changed',
  created_at: new Date().toISOString(),
  data: { id: TRM_ID, external_release_id: REL, previous_status: 'submitted', status, trm_release_id: null, reason: null, ...extra },
});

describe('webhooks (TRM answers 2-4)', () => {
  const inFlight = () => seed({ partner_release_id: TRM_ID, status: 'submitted', submit_count: 1, history: [{ status: 'submitted', at: new Date(Date.now() - 60_000).toISOString() }] });

  it('a rejection shows TRM’s reason, enriched from GET /releases/{id}', async () => {
    inFlight();
    on('GET', new RegExp(`/releases/${TRM_ID}$`), () =>
      json(200, { data: { id: TRM_ID, status: 'rejected', validation_errors: [{ field: 'artwork', message: 'Artwork contains a URL.' }], review: { notes: 'Producer credit must match the label copy.' } } })
    );
    expect(await deliver(statusChanged('evt-1', 'rejected', { reason: 'Artwork and credits need fixing.' }))).toBe('applied');
    expect(submission().status).toBe('rejected');
    expect(rejections.map((r) => r.text)).toEqual([
      'Artwork and credits need fixing.',
      'Artwork contains a URL.',
      'Producer credit must match the label copy.',
    ]);
  });

  it('a rejection with a null reason and nothing on the release says Contact TRM for details', async () => {
    inFlight();
    on('GET', new RegExp(`/releases/${TRM_ID}$`), () => json(200, { data: { id: TRM_ID, status: 'rejected' } }));
    await deliver(statusChanged('evt-2', 'rejected'));
    expect(rejections).toEqual([{ code: null, text: TRM_NO_REASON }]);
  });

  it('delivery_failed with artist_not_found (JSON in a string) becomes needs_account with TRM’s copy', async () => {
    inFlight();
    const body = {
      id: 'evt-3',
      event: 'release.delivery_failed',
      created_at: new Date().toISOString(),
      data: { id: TRM_ID, status: 'rejected', message: '{"error":{"code":"artist_not_found","message":"The target TRM artist was not found."}}' },
    };
    expect(await deliver(body)).toBe('applied');
    expect(submission()).toMatchObject({ status: 'needs_account', error: TRM_ARTIST_NOT_FOUND_TEXT });
    expect(rejections).toHaveLength(0);
    // The paired status_changed -> rejected with no reason leaves it alone.
    await deliver(statusChanged('evt-4', 'rejected'));
    expect(submission().status).toBe('needs_account');
  });

  it('delivery_failed with another code or plain text becomes a fix', async () => {
    inFlight();
    on('GET', new RegExp(`/releases/${TRM_ID}$`), () => json(200, { data: { id: TRM_ID, status: 'rejected' } }));
    await deliver({ id: 'evt-5', event: 'release.delivery_failed', data: { id: TRM_ID, status: 'rejected', message: 'Core timed out' } });
    expect(submission().status).toBe('rejected');
    expect(rejections).toEqual([{ code: null, text: 'Core timed out' }]);
    // The same failure again (paired event) adds nothing new.
    await deliver({ id: 'evt-6', event: 'release.status_changed', data: { id: TRM_ID, status: 'rejected', reason: 'Core timed out' } });
    expect(rejections).toHaveLength(1);
  });

  it('Submitted until TRM reports its own release id, then Received by TRM', async () => {
    inFlight();
    await deliver(statusChanged('evt-7', 'validating'));
    expect(submission().history.some((h) => h.status === 'received')).toBe(false);
    await deliver(statusChanged('evt-8', 'validating', { trm_release_id: 'TRM-REL-42' }));
    expect(submission().history.filter((h) => h.status === 'received')).toEqual([
      expect.objectContaining({ status: 'received', trmReleaseId: 'TRM-REL-42' }),
    ]);
    // Once only.
    await deliver(statusChanged('evt-9', 'accepted', { trm_release_id: 'TRM-REL-42' }));
    expect(submission().history.filter((h) => h.status === 'received')).toHaveLength(1);
  });

  it('the poll marks the receipt too and says so', async () => {
    inFlight();
    on('GET', new RegExp(`/releases/${TRM_ID}$`), () => json(200, { data: { id: TRM_ID, status: 'submitted', trm_release_id: 'TRM-REL-9' } }));
    const result = await refreshFromTrm(admin, REL);
    expect(result).toMatchObject({ ok: true, data: { status: 'submitted', received: true } });
  });
});

describe('resubmit after a rejection (TRM answer 2)', () => {
  it('PATCHes the full metadata, re-verifies both assets and submits, all on new keys', async () => {
    seed({
      partner_release_id: TRM_ID,
      status: 'rejected',
      submit_count: 1,
      artist_email: 'hadiza@x.com',
      artwork_asset_id: 'trm-art-1',
      artwork_source_id: 'art-1',
      audio_asset_id: 'trm-audio-1',
      history: [{ status: 'submitted', at: 'a' }, { status: 'rejected', at: 'b' }],
    });
    on('GET', /\/capabilities$/, () => json(200, { data: { stores: ['Spotify'] } }));
    on('PATCH', new RegExp(`/releases/${TRM_ID}$`), () => json(200, {}));
    on('POST', /\/complete$/, () => json(200, {}));
    on('POST', /\/submit$/, () => json(200, {}));
    expect((await prepareTrmDraft(admin, REL, actor, { artistEmail: 'hadiza@x.com', termsAccepted: true })).ok).toBe(true);
    expect((await submitToTrm(admin, REL, actor)).ok).toBe(true);

    const patch = trmCalls('PATCH', /\/releases\//)[0];
    expect(patch.body).toMatchObject({ title: 'Iyawo Mi', stores: ['Spotify'] });
    expect(patch.body).not.toHaveProperty('external_release_id');
    expect(patch.headers['Idempotency-Key']).toContain(':r1:');
    const completes = trmCalls('POST', /\/complete$/).map((c) => c.url.split('/assets/')[1]);
    expect(completes).toEqual(['trm-art-1/complete', 'trm-audio-1/complete']);
    trmCalls('POST', /\/complete$/).forEach((c) => expect(c.headers['Idempotency-Key']).toContain(':r1:'));
    expect(trmCalls('POST', /\/submit$/)[0].headers['Idempotency-Key']).toContain(':2');
    expect(submission()).toMatchObject({ status: 'submitted', submit_count: 2, error: null });
  });
});

describe('reasonsFromTrmRelease', () => {
  it('reads strings, objects and field maps, and ignores junk', () => {
    expect(reasonsFromTrmRelease({ validation_errors: ['Bad ISRC'], review: { reason: 'Cover has a logo' } })).toEqual([
      { code: null, text: 'Bad ISRC' },
      { code: null, text: 'Cover has a logo' },
    ]);
    expect(reasonsFromTrmRelease({ validation_errors: { 'tracks.0.isrc': ['Invalid ISRC'] } })).toEqual([{ code: 'tracks.0.isrc', text: 'Invalid ISRC' }]);
    expect(reasonsFromTrmRelease({ validation_errors: null, review: 42 })).toEqual([]);
  });
});
