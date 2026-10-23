// Rollout Trash: public and sweep read paths treat a deleted rollout as missing.
// A fake admin client applies the chained filters to canned rows, so these
// tests fail if `.is('deleted_at', null)` is dropped from a query.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

type Call = { table: string; op: string; args: unknown[] };

function fakeAdmin(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    const chain =
      (op: string, apply?: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        calls.push({ table, op, args });
        apply?.(...args);
        return builder;
      };
    builder.select = chain('select');
    builder.in = chain('in', (col, vals) => {
      rows = rows.filter((r) => (vals as unknown[]).includes(r[col as string]));
    });
    builder.eq = chain('eq', (col, val) => {
      rows = rows.filter((r) => r[col as string] === val);
    });
    builder.is = chain('is', (col, val) => {
      rows = rows.filter((r) => (r[col as string] ?? null) === val);
    });
    builder.not = chain('not');
    builder.or = chain('or');
    builder.gte = chain('gte');
    builder.lte = chain('lte');
    builder.order = chain('order');
    builder.limit = chain('limit', (n) => {
      rows = rows.slice(0, Number(n));
    });
    builder.maybeSingle = () => {
      calls.push({ table, op: 'maybeSingle', args: [] });
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    };
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, count: rows.length, error: null });
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

function filtersDeleted(calls: Call[], table = 'releases'): boolean {
  return calls.some(
    (c) => c.table === table && c.op === 'is' && c.args[0] === 'deleted_at' && c.args[1] === null
  );
}

const live = {
  id: 'r-live',
  owner_user_id: 'u1',
  artist_id: 'a1',
  artist_name: 'Artist',
  title: 'Live',
  release_date: '2026-12-01',
  release_type: 'single',
  status: 'draft',
  metadata: {},
  deleted_at: null,
};
const gone = { ...live, id: 'r-gone', title: 'Gone', deleted_at: '2026-10-20T00:00:00Z' };

let supabaseTables: Record<string, Row[]> = {};
vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: () => fakeAdmin(supabaseTables).client,
  };
});

describe('smart link facts', () => {
  it('treats a deleted rollout as missing and serves a live one', async () => {
    const { loadSmartLinkFacts } = await import('@/lib/altlink/server');
    const { client, calls } = fakeAdmin({ releases: [live, gone] });
    expect(await loadSmartLinkFacts(client, 'r-gone')).toBeNull();
    const facts = await loadSmartLinkFacts(client, 'r-live');
    expect(facts?.title).toBe('Live');
    expect(filtersDeleted(calls)).toBe(true);
  });
});

describe('distribution facts', () => {
  it('treats a deleted rollout as missing', async () => {
    const { loadDistributionFacts } = await import('@/lib/distribution-server');
    const { client, calls } = fakeAdmin({ releases: [live, gone] });
    expect(await loadDistributionFacts(client, 'r-gone')).toBeNull();
    expect(await loadDistributionFacts(client, 'r-live')).not.toBeNull();
    expect(filtersDeleted(calls)).toBe(true);
  });
});

describe('pitch kit', () => {
  it('answers 404 for a deleted rollout (public /k story reads this)', async () => {
    const { loadPitchKit } = await import('@/lib/release-epk-server');
    const { client, calls } = fakeAdmin({ releases: [live, gone] });
    const result = await loadPitchKit(client, 'r-gone');
    expect(result).toEqual({ error: 'Rollout not found.', status: 404 });
    expect(filtersDeleted(calls)).toBe(true);
  });
});

describe('delivery scan', () => {
  it('leaves deleted rollouts out of the scan', async () => {
    const { loadDeliveryScan } = await import('@/lib/delivery-records-server');
    const { client } = fakeAdmin({ releases: [live, gone], tasks: [] });
    const scan = await loadDeliveryScan(client);
    expect(scan.releases.map((r) => r.id)).toEqual(['r-live']);
  });
});

describe('notes and pitching ownership checks', () => {
  it('notes: a deleted rollout is Rollout not found', async () => {
    const { ensureReleaseOwnership } = await import('@/app/api/notes/_shared');
    const { client } = fakeAdmin({ releases: [live, gone] });
    const deleted = await ensureReleaseOwnership(client as never, 'r-gone', 'u1');
    expect('error' in deleted && deleted.error.status).toBe(404);
    const ok = await ensureReleaseOwnership(client as never, 'r-live', 'u1');
    expect(ok).toEqual({ releaseId: 'r-live' });
  });

  it('pitching: a deleted rollout is not visible', async () => {
    const { ensureReleaseVisible } = await import('@/app/api/pitching/_shared');
    const { client, calls } = fakeAdmin({ releases: [live, gone] });
    const deleted = await ensureReleaseVisible(client, 'r-gone', { id: 'u1' });
    expect('error' in deleted && deleted.error.status).toBe(404);
    expect(filtersDeleted(calls)).toBe(true);
  });

  it('planner: loadOwnedRelease answers 404 for a deleted rollout', async () => {
    const { loadOwnedRelease } = await import('@/app/api/releases/[releaseId]/plan/_shared');
    const { client } = fakeAdmin({ releases: [live, gone] });
    const deleted = await loadOwnedRelease(client as never, 'r-gone', 'u1');
    expect('error' in deleted && deleted.error.status).toBe(404);
    const ok = await loadOwnedRelease(client as never, 'r-live', 'u1');
    expect('release' in ok).toBe(true);
  });
});

describe('public credit form', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_METADATA', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
    supabaseTables = {
      release_credit_links: [
        { release_id: 'r-live', share_token: 'live-token-aaaaaaaaaaaa', closed_at: null },
        { release_id: 'r-gone', share_token: 'gone-token-aaaaaaaaaaaa', closed_at: null },
      ],
      releases: [live, gone],
    };
  });

  it('a deleted rollout reads as missing; a live one still opens', async () => {
    const { loadPublicCreditForm } = await import('@/lib/credits-server');
    expect(await loadPublicCreditForm('gone-token-aaaaaaaaaaaa')).toEqual({ kind: 'missing' });
    const ok = await loadPublicCreditForm('live-token-aaaaaaaaaaaa');
    expect(ok.kind).toBe('ok');
  });
});
