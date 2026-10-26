import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AltlinkError, type AltlinkClient } from '@/lib/altlink/client';
import { enrichCatalogueCodes, makeCatalogueLink } from './links-server';

// A small in-memory stand-in for the PostgREST calls these functions make.
type Row = Record<string, unknown>;
const UNIQUE: Record<string, string[]> = { catalogue_smart_links: ['catalogue_release_id'] };

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 26, 10, 0, tick++)).toISOString();

  function from(table: string) {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    let head = false;
    let max = Infinity;
    const run = () => {
      const hit = () => rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'insert') {
        for (const key of UNIQUE[table] ?? []) {
          if (rows.some((r) => r[key] === payload[key])) return { data: null, error: { code: '23505', message: 'dup' } };
        }
        const row: Row = { id: `row-${rows.length + 1}`, created_at: stamp(), updated_at: stamp(), url: null, ...payload };
        rows.push(row);
        return { data: [row], error: null };
      }
      if (op === 'update') {
        const matched = hit();
        for (const r of matched) Object.assign(r, payload, { updated_at: stamp() });
        return { data: matched, error: null };
      }
      if (op === 'delete') {
        const keep = rows.filter((r) => !filters.every((f) => f(r)));
        rows.splice(0, rows.length, ...keep);
        return { data: null, error: null };
      }
      const matched = hit().slice(0, max);
      return { data: head ? null : matched, count: hit().length, error: null };
    };
    const b: Record<string, unknown> = {
      select: (_c?: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return b;
      },
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      gte: (k: string, v: unknown) => (filters.push((r) => String(r[k]) >= String(v)), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
      order: () => b,
      limit: (n: number) => ((max = n), b),
      insert: (row: Row) => ((op = 'insert'), (payload = row), b),
      update: (fields: Row) => ((op = 'update'), (payload = fields), b),
      delete: () => ((op = 'delete'), b),
      maybeSingle: async () => {
        const r = run();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : null, error: r.error };
      },
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return b;
  }
  return { client: { from } as unknown as SupabaseClient, tables };
}

const NOW = Date.parse('2026-10-26T10:00:00Z');
const WS = 'ws-1';
const release = (over: Row = {}): Row => ({
  id: 'rel-1',
  workspace_id: WS,
  artist_id: 'art-1',
  title: 'Dai Dai',
  release_date: '2026-08-07',
  cover_url: 'https://cdn.example/c.jpg',
  source: 'deezer',
  source_id: '1047979382',
  kind: 'single',
  upc: '196874528037',
  isrc: 'USQX92602558',
  codes_checked_at: '2026-10-26T09:00:00Z',
  ...over,
});
const seed = (releases: Row[] = [release()], extra: Record<string, Row[]> = {}) => ({
  artist_catalogue_releases: releases,
  catalogue_smart_links: [],
  artists: [{ id: 'art-1', name: 'Wizkid' }],
  app_settings: [],
  ...extra,
});

type CreateInput = Record<string, unknown>;
function altlink(
  createLink = vi.fn(async (_input: CreateInput) => ({ id: 'al-1', slug: 'dai-dai', url: 'https://altlink.co/dai-dai' }))
) {
  return { client: { createLink } as unknown as AltlinkClient, createLink };
}
const args = (client: AltlinkClient, over: Row = {}) => ({
  releaseRowId: 'rel-1',
  workspaceIds: [WS],
  userId: 'user-1',
  userEmail: 'a@b.co',
  client,
  nowMs: NOW,
  ...over,
});

describe('makeCatalogueLink', () => {
  it('makes one link, sends the codes and cover, and stores the result', async () => {
    const db = fakeDb(seed());
    const { client, createLink } = altlink();
    const out = await makeCatalogueLink(db.client, args(client));
    expect(out).toMatchObject({ kind: 'made', url: 'https://altlink.co/dai-dai', cap: { used: 1, limit: 10, remaining: 9 } });
    expect(createLink).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dai Dai',
        artist: 'Wizkid',
        release_type: 'single',
        status: 'live',
        external_release_id: 'rel-1',
        upc: '196874528037',
        isrc: 'USQX92602558',
        artwork_url: 'https://cdn.example/c.jpg',
      })
    );
    expect(db.tables.catalogue_smart_links[0]).toMatchObject({ status: 'made', url: 'https://altlink.co/dai-dai' });
  });

  it('always sends the date; a past or today’s release goes as live, a future one as approved (a pre-save)', async () => {
    const past = altlink();
    await makeCatalogueLink(fakeDb(seed()).client, args(past.client));
    expect(past.createLink.mock.calls[0][0]).toMatchObject({ release_date: '2026-08-07', status: 'live' });

    const future = altlink();
    await makeCatalogueLink(fakeDb(seed([release({ release_date: '2026-11-20' })])).client, args(future.client));
    expect(future.createLink.mock.calls[0][0]).toMatchObject({ release_date: '2026-11-20', status: 'approved' });

    const today = altlink();
    await makeCatalogueLink(fakeDb(seed([release({ release_date: '2026-10-26' })])).client, args(today.client));
    expect(today.createLink.mock.calls[0][0]).toMatchObject({ release_date: '2026-10-26', status: 'live' });
  });

  it('sends the release type Altlink expects', async () => {
    const ep = altlink();
    await makeCatalogueLink(fakeDb(seed([release({ kind: 'ep' })])).client, args(ep.client));
    expect(ep.createLink.mock.calls[0][0]).toMatchObject({ release_type: 'ep' });
  });

  it('does not count a release no store lists yet, and says so', async () => {
    const db = fakeDb(seed());
    const missing = altlink(vi.fn(async (_input: CreateInput) => Promise.reject(new AltlinkError(404, 'release_not_found_on_platforms', 'not yet'))));
    expect(await makeCatalogueLink(db.client, args(missing.client))).toEqual({ kind: 'not_on_stores' });
    expect(db.tables.catalogue_smart_links).toHaveLength(0);
  });

  it('keeps Altlink’s own message on a failed row', async () => {
    const db = fakeDb(seed());
    const failing = altlink(vi.fn(async (_input: CreateInput) => Promise.reject(new AltlinkError(400, 'invalid_request', 'release_date must be in the future'))));
    await makeCatalogueLink(db.client, args(failing.client));
    expect(db.tables.catalogue_smart_links[0].last_error).toBe('invalid_request: release_date must be in the future');
  });

  it('answers a second tap with the same link and calls Altlink once', async () => {
    const db = fakeDb(seed());
    const { client, createLink } = altlink();
    await makeCatalogueLink(db.client, args(client));
    const again = await makeCatalogueLink(db.client, args(client));
    expect(again).toEqual({ kind: 'exists', url: 'https://altlink.co/dai-dai' });
    expect(createLink).toHaveBeenCalledTimes(1);
  });

  it('refuses a release from another team', async () => {
    const db = fakeDb(seed());
    const { client, createLink } = altlink();
    expect(await makeCatalogueLink(db.client, args(client, { workspaceIds: ['ws-other'] }))).toEqual({ kind: 'not_found' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('needs a code, and does not call Altlink without one', async () => {
    const db = fakeDb(seed([release({ upc: null, isrc: null })]));
    const { client, createLink } = altlink();
    expect(await makeCatalogueLink(db.client, args(client))).toEqual({ kind: 'no_code' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('stops at the daily cap and never calls Altlink', async () => {
    const made = Array.from({ length: 10 }, (_, i) => ({
      id: `l-${i}`,
      catalogue_release_id: `other-${i}`,
      workspace_id: WS,
      status: 'made',
      created_at: '2026-10-26T08:00:00Z',
      updated_at: '2026-10-26T08:00:00Z',
    }));
    const db = fakeDb(seed([release()], { catalogue_smart_links: made }));
    const { client, createLink } = altlink();
    const out = await makeCatalogueLink(db.client, args(client));
    expect(out).toMatchObject({ kind: 'cap', cap: { used: 10, limit: 10, remaining: 0 } });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('counts only today (Lagos): yesterday evening Lagos time does not use today’s allowance', async () => {
    const yesterday = Array.from({ length: 10 }, (_, i) => ({
      id: `l-${i}`,
      catalogue_release_id: `other-${i}`,
      workspace_id: WS,
      status: 'made',
      created_at: '2026-10-25T22:00:00Z',
      updated_at: '2026-10-25T22:00:00Z',
    }));
    const db = fakeDb(seed([release()], { catalogue_smart_links: yesterday }));
    const out = await makeCatalogueLink(db.client, args(altlink().client));
    expect(out.kind).toBe('made');
  });

  it('uses the limit from settings when there is one', async () => {
    const made = Array.from({ length: 3 }, (_, i) => ({
      id: `l-${i}`,
      catalogue_release_id: `other-${i}`,
      workspace_id: WS,
      status: 'made',
      created_at: '2026-10-26T08:00:00Z',
      updated_at: '2026-10-26T08:00:00Z',
    }));
    const db = fakeDb(
      seed([release()], { catalogue_smart_links: made, app_settings: [{ key: 'catalogue_links_per_day', value_json: { limit: 3 } }] })
    );
    expect((await makeCatalogueLink(db.client, args(altlink().client))).kind).toBe('cap');
  });

  it('does not count a failed attempt, and lets the person try again', async () => {
    const db = fakeDb(seed());
    const failing = altlink(vi.fn(async (_input: CreateInput) => Promise.reject(new AltlinkError(500, 'boom', 'x'))));
    expect((await makeCatalogueLink(db.client, args(failing.client))).kind).toBe('failed');
    expect(db.tables.catalogue_smart_links[0]).toMatchObject({ status: 'failed' });
    const ok = await makeCatalogueLink(db.client, args(altlink().client));
    expect(ok).toMatchObject({ kind: 'made', cap: { used: 1 } });
  });

  it('gives a rate limit from Altlink back as "busy, try later" and leaves no claim behind', async () => {
    const db = fakeDb(seed());
    const limited = altlink(vi.fn(async (_input: CreateInput) => Promise.reject(new AltlinkError(429, 'rate_limited', 'slow'))));
    expect(await makeCatalogueLink(db.client, args(limited.client))).toEqual({ kind: 'rate_limited' });
    expect(db.tables.catalogue_smart_links).toHaveLength(0);
  });

  it('treats a fresh pending claim as busy, so a double tap makes one link', async () => {
    const db = fakeDb(
      seed([release()], {
        catalogue_smart_links: [
          { id: 'l-1', catalogue_release_id: 'rel-1', workspace_id: WS, status: 'pending', created_at: '2026-10-26T09:59:30Z', updated_at: '2026-10-26T09:59:30Z' },
        ],
      })
    );
    const { client, createLink } = altlink();
    expect(await makeCatalogueLink(db.client, args(client))).toEqual({ kind: 'busy' });
    expect(createLink).not.toHaveBeenCalled();
  });
});

describe('enrichCatalogueCodes', () => {
  const unchecked = (id: string, kind = 'single', source = 'deezer'): Row =>
    release({ id, source, kind, source_id: id.replace('rel-', ''), upc: null, isrc: null, codes_checked_at: null });

  it('fills codes for Deezer rows and stamps them as checked', async () => {
    const db = fakeDb(seed([unchecked('rel-11'), unchecked('rel-12', 'ep')]));
    const lookup = vi.fn(async (id: string) => ({ upc: `19687452803${id.slice(-1)}`, isrc: null }));
    const left = await enrichCatalogueCodes(db.client, 'art-1', { sleep: async () => undefined, lookup });
    expect(left).toBe(0);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(db.tables.artist_catalogue_releases[0]).toMatchObject({ upc: '196874528031' });
    expect(db.tables.artist_catalogue_releases[0].codes_checked_at).toBeTruthy();
  });

  it('puts a row back when Deezer could not be reached, so a later run tries it again', async () => {
    const db = fakeDb(seed([unchecked('rel-11')]));
    const left = await enrichCatalogueCodes(db.client, 'art-1', { sleep: async () => undefined, lookup: async () => null });
    expect(left).toBe(1);
    expect(db.tables.artist_catalogue_releases[0].codes_checked_at).toBeNull();
  });

  it('leaves rows that already have a stamp, and Apple rows, alone', async () => {
    const db = fakeDb(seed([release(), unchecked('rel-13', 'single', 'itunes')]));
    const lookup = vi.fn(async () => ({ upc: null, isrc: null }));
    await enrichCatalogueCodes(db.client, 'art-1', { sleep: async () => undefined, lookup });
    expect(lookup).not.toHaveBeenCalled();
  });
});
