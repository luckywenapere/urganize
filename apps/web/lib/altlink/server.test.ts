import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AltlinkError, type AltlinkClient } from './client';
import { applyAltlinkWebhook, loadLiveSmartLinkUrl, syncSmartLink } from './server';

// A small in-memory stand-in for the PostgREST calls the server code makes.
// Unique keys behave like the migration's: a clash answers 23505.

type Row = Record<string, unknown>;
const UNIQUE: Record<string, string[]> = {
  release_smart_links: ['release_id', 'altlink_link_id'],
  altlink_webhook_events: ['event_id'],
};

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  let tick = 0;
  const stampNow = () => new Date(Date.UTC(2026, 9, 22, 11, 0, tick++)).toISOString();

  function query(table: string) {
    const rows = (tables[table] ??= []);
    const filters: [string, unknown][] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
    const run = (): { data: unknown; error: { code?: string; message: string } | null } => {
      if (op === 'insert') {
        for (const key of UNIQUE[table] ?? []) {
          if (payload[key] != null && rows.some((r) => r[key] === payload[key])) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
        }
        const row: Row = {
          id: `id-${rows.length + 1}`,
          created_at: stampNow(),
          updated_at: stampNow(),
          ...(table === 'release_smart_links'
            ? { status: 'pending', platforms: [], presave_signups: 0, altlink_link_id: null, url: null, stats: null }
            : {}),
          ...payload,
        };
        rows.push(row);
        return { data: [row], error: null };
      }
      if (op === 'update') {
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, payload, { updated_at: stampNow() });
        return { data: hit, error: null };
      }
      if (op === 'delete') {
        const keep = rows.filter((r) => !match(r));
        const gone = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { data: gone, error: null };
      }
      return { data: rows.filter(match), error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return builder;
      },
      limit: () => builder,
      is: () => builder,
      or: () => builder,
      insert: (row: Row) => {
        op = 'insert';
        payload = row;
        return builder;
      },
      update: (fields: Row) => {
        op = 'update';
        payload = fields;
        return builder;
      },
      delete: () => {
        op = 'delete';
        return builder;
      },
      maybeSingle: async () => {
        const res = run();
        return { data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data, error: res.error };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        try {
          return Promise.resolve(run()).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return builder;
  }
  return { client: { from: query } as unknown as SupabaseClient, tables };
}

const RELEASE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-10-22T11:00:00Z');

function seed(over: { upc?: string | null; date?: string; trm?: Row } = {}) {
  return {
    releases: [
      {
        id: RELEASE_ID,
        title: 'Free Mind',
        artist_name: 'Tems',
        release_date: over.date ?? '2026-11-06',
        owner_user_id: 'owner-1',
        artwork_asset_id: null,
        metadata: {},
        archived_at: null,
        status: 'draft',
        release_type: 'single',
      },
    ],
    release_metadata: [{ release_id: RELEASE_ID, upc: over.upc === undefined ? '123456789012' : over.upc, isrc: null }],
    distribution_submissions: over.trm ? [{ release_id: RELEASE_ID, partner: 'trm', ...over.trm }] : [],
    profiles: [{ id: 'owner-1', email: 'manager@example.com' }],
    release_events: [],
  };
}

function fakeClient(impl?: Partial<AltlinkClient>): AltlinkClient & { createLink: ReturnType<typeof vi.fn> } {
  const createLink = vi.fn(async (input: { external_release_id: string; release_date?: string }) => ({
    id: 'lnk_1',
    slug: 'free-mind',
    url: 'https://altlink.co/free-mind',
    externalReleaseId: input.external_release_id,
    type: input.release_date ? 'pre_save' : 'smart_link',
    releaseDate: input.release_date ?? null,
    status: 'scheduled',
    claimUrl: 'https://altlink.co/claim/x',
    platforms: [],
  }));
  return {
    health: vi.fn(),
    createLink,
    patchLink: vi.fn(async () => null),
    getStats: vi.fn(async () => null),
    ...impl,
  } as unknown as AltlinkClient & { createLink: ReturnType<typeof vi.fn> };
}

describe('syncSmartLink', () => {
  it('makes one link for a ready rollout, with the manager as creator_email', async () => {
    const { client: db, tables } = fakeDb(seed());
    const altlink = fakeClient();
    const outcome = await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    expect(outcome.kind).toBe('created');
    expect(altlink.createLink).toHaveBeenCalledTimes(1);
    expect(altlink.createLink.mock.calls[0][0]).toMatchObject({
      external_release_id: RELEASE_ID,
      artist: 'Tems',
      release_type: 'single',
      status: 'approved',
      upc: '123456789012',
      release_date: '2026-11-06',
      creator_email: 'manager@example.com',
      timezone: 'Africa/Lagos',
    });
    expect(tables.release_smart_links).toHaveLength(1);
    expect(tables.release_smart_links[0]).toMatchObject({ status: 'scheduled', url: 'https://altlink.co/free-mind', claim_url: 'https://altlink.co/claim/x' });
    expect(tables.release_events.map((e) => e.type)).toEqual(['smart_link_created']);
  });

  it('prefers the artist email on the TRM submission', async () => {
    const { client: db } = fakeDb(seed({ upc: null, trm: { upc: '1234567890123', isrc: null, artist_email: 'artist@example.com' } }));
    const altlink = fakeClient();
    await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    expect(altlink.createLink.mock.calls[0][0]).toMatchObject({ upc: '1234567890123', creator_email: 'artist@example.com' });
  });

  it('is idempotent: a second save, and two saves at once, make one link', async () => {
    const { client: db, tables } = fakeDb(seed());
    const altlink = fakeClient();
    const [a, b] = await Promise.all([
      syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW }),
      syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW }),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(['busy', 'created']);
    const again = await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    expect(again.kind).toBe('unchanged');
    expect(altlink.createLink).toHaveBeenCalledTimes(1);
    expect(tables.release_smart_links).toHaveLength(1);
  });

  it('waits, calling nothing, when there is no code before release day', async () => {
    const { client: db } = fakeDb(seed({ upc: null }));
    const altlink = fakeClient();
    expect(await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW })).toEqual({ kind: 'not_ready', reason: 'no_code' });
    expect(altlink.createLink).not.toHaveBeenCalled();
  });

  it('patches a new UPC silently when the link was made from the ISRC', async () => {
    const { client: db, tables } = fakeDb(seed({ upc: null }));
    tables.release_metadata[0].isrc = 'NGA1B2600001';
    const altlink = fakeClient();
    await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    tables.release_metadata[0].upc = '123456789012';
    const outcome = await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    expect(outcome.kind).toBe('patched');
    expect(altlink.patchLink).toHaveBeenCalledWith('lnk_1', { upc: '123456789012' });
    expect(tables.release_smart_links[0].sent_upc).toBe('123456789012');
  });

  it('waits, calling nothing, when the song is out and there is no code', async () => {
    const { client: db, tables } = fakeDb(seed({ upc: null, date: '2026-09-01' }));
    const altlink = fakeClient();
    expect(await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW })).toEqual({ kind: 'not_ready', reason: 'no_code' });
    expect(altlink.createLink).not.toHaveBeenCalled();
    expect(tables.release_smart_links ?? []).toHaveLength(0);
  });

  it('makes a live link when the release day has passed: the date is still sent (Altlink requires it), status live', async () => {
    const { client: db } = fakeDb(seed({ date: '2026-09-01' }));
    const altlink = fakeClient();
    await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    expect(altlink.createLink.mock.calls[0][0]).toMatchObject({ release_date: '2026-09-01', status: 'live' });
  });

  it('treats 422 missing_identifier as not ready: no error, no row left', async () => {
    const { client: db, tables } = fakeDb(seed());
    const altlink = fakeClient({
      createLink: vi.fn(async () => {
        throw new AltlinkError(422, 'missing_identifier', 'need a code');
      }) as unknown as AltlinkClient['createLink'],
    });
    expect(await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW })).toEqual({ kind: 'not_ready', reason: 'missing_identifier' });
    expect(tables.release_smart_links).toHaveLength(0);
  });

  it('records a failure, does not retry it on its own, and Try again does', async () => {
    const { client: db, tables } = fakeDb(seed());
    const down = fakeClient({
      createLink: vi.fn(async () => {
        throw new AltlinkError(503, 'http_503', 'down');
      }) as unknown as AltlinkClient['createLink'],
    });
    const first = await syncSmartLink(db, RELEASE_ID, { client: down, now: NOW });
    expect(first.kind).toBe('failed');
    expect(tables.release_smart_links[0]).toMatchObject({ status: 'failed', last_error: 'http_503' });

    const up = fakeClient();
    expect((await syncSmartLink(db, RELEASE_ID, { client: up, now: NOW })).kind).toBe('failed');
    expect(up.createLink).not.toHaveBeenCalled();
    expect((await syncSmartLink(db, RELEASE_ID, { client: up, now: NOW, retry: true })).kind).toBe('created');
    expect(tables.release_smart_links).toHaveLength(1);
  });

  it('patches the ISRC silently when it arrives later', async () => {
    const { client: db, tables } = fakeDb(seed());
    const altlink = fakeClient();
    await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    tables.release_metadata[0].isrc = 'NGA1B2600001';
    const outcome = await syncSmartLink(db, RELEASE_ID, { client: altlink, now: NOW });
    expect(outcome.kind).toBe('patched');
    expect(altlink.patchLink).toHaveBeenCalledWith('lnk_1', { isrc: 'NGA1B2600001' });
    expect(tables.release_smart_links[0].sent_isrc).toBe('NGA1B2600001');
  });

  it('serves the live URL for the old fan page redirect, but never a failed one', async () => {
    const { client: db, tables } = fakeDb(seed());
    expect(await loadLiveSmartLinkUrl(db, RELEASE_ID)).toBeNull();
    await syncSmartLink(db, RELEASE_ID, { client: fakeClient(), now: NOW });
    expect(await loadLiveSmartLinkUrl(db, RELEASE_ID)).toBe('https://altlink.co/free-mind');
    tables.release_smart_links[0].status = 'failed';
    expect(await loadLiveSmartLinkUrl(db, RELEASE_ID)).toBeNull();
  });
});

describe('applyAltlinkWebhook', () => {
  async function withLink() {
    const fake = fakeDb(seed());
    await syncSmartLink(fake.client, RELEASE_ID, { client: fakeClient(), now: NOW });
    return fake;
  }

  it('dedupes on event_id', async () => {
    const { client: db, tables } = await withLink();
    const event = { eventId: 'evt_1', type: 'presave.signup', linkId: 'lnk_1', externalReleaseId: RELEASE_ID, platforms: null, link: null } as const;
    expect(await applyAltlinkWebhook(db, event)).toBe('applied');
    expect(await applyAltlinkWebhook(db, event)).toBe('duplicate');
    expect(tables.release_smart_links[0].presave_signups).toBe(1);
  });

  it('stores platforms and marks a converted link once', async () => {
    const { client: db, tables } = await withLink();
    const platforms = [{ id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/x', isActive: true }];
    await applyAltlinkWebhook(db, { eventId: 'e2', type: 'link.platforms_updated', linkId: 'lnk_1', externalReleaseId: null, platforms, link: null });
    expect(tables.release_smart_links[0].platforms).toEqual(platforms);
    await applyAltlinkWebhook(db, { eventId: 'e3', type: 'link.converted', linkId: 'lnk_1', externalReleaseId: null, platforms: null, link: null });
    expect(tables.release_smart_links[0].status).toBe('converted');
    expect(tables.release_events.filter((e) => e.type === 'smart_link_converted')).toHaveLength(1);
  });

  it('answers no_link for a link we do not hold', async () => {
    const { client: db } = fakeDb(seed());
    expect(
      await applyAltlinkWebhook(db, { eventId: 'e4', type: 'link.converted', linkId: 'other', externalReleaseId: null, platforms: null, link: null })
    ).toBe('no_link');
  });
});
