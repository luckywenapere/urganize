import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/asset-helpers', () => ({ RELEASE_ASSETS_BUCKET: 'release-assets' }));
vi.mock('@/lib/image-thumb', () => ({ withThumbPaths: (paths: string[]) => paths }));

import {
  dropRowsOfDeletedReleases,
  findDeletedReleaseIds,
  listTrashedReleases,
  purgeExpiredReleases,
  restoreRelease,
  softDeleteRelease,
} from './rollout-trash-server';

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the chained supabase builder: it applies
 * eq / in / is / not / lt filters to canned rows and records updates and
 * deletes so the tests can assert what was written. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: 'update' | 'delete'; patch?: Row; ids: unknown[] }> = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let op: 'select' | 'update' | 'delete' = 'select';
    let patch: Row | undefined;
    let head = false;
    let counted = false;
    const builder: Record<string, unknown> = {};
    const filter = (fn: (row: Row) => boolean) => {
      rows = rows.filter(fn);
      return builder;
    };
    Object.assign(builder, {
      select: (_cols?: string, opts?: { head?: boolean; count?: string }) => {
        head = Boolean(opts?.head);
        counted = Boolean(opts?.count);
        return builder;
      },
      update: (value: Row) => {
        op = 'update';
        patch = value;
        return builder;
      },
      delete: () => {
        op = 'delete';
        return builder;
      },
      eq: (col: string, val: unknown) => filter((r) => r[col] === val),
      in: (col: string, vals: unknown[]) => filter((r) => vals.includes(r[col])),
      lt: (col: string, val: string) => filter((r) => String(r[col]) < val),
      is: (col: string, val: unknown) => filter((r) => (val === null ? r[col] == null : r[col] === val)),
      not: (col: string, _op: string, val: unknown) =>
        filter((r) => (val === null ? r[col] != null : r[col] !== val)),
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (op === 'update' || op === 'delete') {
          writes.push({ table, op, patch, ids: rows.map((r) => r.id) });
          for (const row of rows) {
            if (op === 'update') Object.assign(row, patch);
            else tables[table] = (tables[table] ?? []).filter((r) => r !== row);
          }
        }
        return Promise.resolve({
          data: head ? null : rows,
          count: counted ? rows.length : null,
          error: null,
        }).then(resolve);
      },
    });
    return builder;
  };
  const storage = { from: () => ({ remove: async () => ({ error: null }) }) };
  return { client: { from, storage } as unknown as SupabaseClient, writes, tables };
}

const NOW = new Date('2026-10-23T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('softDeleteRelease and restoreRelease', () => {
  it('sets deleted_at for the owner and writes nothing else', async () => {
    const { client, tables, writes } = fakeAdmin({
      releases: [{ id: 'r1', owner_user_id: 'u1', deleted_at: null }],
    });
    expect(await softDeleteRelease(client, 'r1', 'u1', NOW)).toEqual({ ok: true });
    expect(tables.releases[0].deleted_at).toBe(NOW.toISOString());
    expect(tables.releases[0].deleted_by).toBe('u1');
    expect(writes.every((w) => w.op === 'update')).toBe(true);
  });

  it('refuses another user and an already deleted rollout', async () => {
    const { client } = fakeAdmin({
      releases: [
        { id: 'r1', owner_user_id: 'u1', deleted_at: null },
        { id: 'r2', owner_user_id: 'u1', deleted_at: daysAgo(1) },
      ],
    });
    expect(await softDeleteRelease(client, 'r1', 'u2')).toMatchObject({ ok: false, status: 404 });
    expect(await softDeleteRelease(client, 'r2', 'u1')).toMatchObject({ ok: false, status: 404 });
  });

  it('restores only a rollout that is in Trash, and leaves its tasks alone', async () => {
    const { client, tables, writes } = fakeAdmin({
      releases: [
        { id: 'r1', owner_user_id: 'u1', deleted_at: daysAgo(3), deleted_by: 'u1' },
        { id: 'r2', owner_user_id: 'u1', deleted_at: null },
      ],
      tasks: [{ id: 't1', release_id: 'r1' }],
    });
    expect(await restoreRelease(client, 'r1', 'u1')).toEqual({ ok: true });
    expect(tables.releases[0].deleted_at).toBeNull();
    expect(await restoreRelease(client, 'r2', 'u1')).toMatchObject({ ok: false, status: 404 });
    expect(tables.tasks).toHaveLength(1);
    expect(writes.some((w) => w.table === 'tasks')).toBe(false);
  });
});

describe('deleted-rollout filters', () => {
  it('finds which ids are in Trash', async () => {
    const { client } = fakeAdmin({
      releases: [
        { id: 'r1', deleted_at: daysAgo(1) },
        { id: 'r2', deleted_at: null },
      ],
    });
    expect([...(await findDeletedReleaseIds(client, ['r1', 'r2', 'r3']))]).toEqual(['r1']);
  });

  it('drops rows of deleted rollouts and keeps the rest', async () => {
    const { client } = fakeAdmin({
      releases: [
        { id: 'r1', deleted_at: daysAgo(1) },
        { id: 'r2', deleted_at: null },
      ],
    });
    const tasks = [
      { id: 't1', release_id: 'r1' },
      { id: 't2', release_id: 'r2' },
    ];
    const kept = await dropRowsOfDeletedReleases(client, tasks, (t) => t.release_id);
    expect(kept.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('Trash list and purge', () => {
  it('lists only the owner’s deleted rollouts with their task counts', async () => {
    const { client } = fakeAdmin({
      releases: [
        { id: 'r1', owner_user_id: 'u1', title: 'A', deleted_at: daysAgo(2) },
        { id: 'r2', owner_user_id: 'u1', title: 'B', deleted_at: null },
        { id: 'r3', owner_user_id: 'u2', title: 'C', deleted_at: daysAgo(2) },
      ],
      tasks: [
        { id: 't1', release_id: 'r1' },
        { id: 't2', release_id: 'r1' },
      ],
    });
    const items = await listTrashedReleases(client, 'u1');
    expect(items.map((i) => [i.id, i.taskCount])).toEqual([['r1', 2]]);
  });

  it('purges only rollouts deleted more than 30 days ago', async () => {
    const { client, tables } = fakeAdmin({
      releases: [
        { id: 'old', owner_user_id: 'u1', deleted_at: daysAgo(31) },
        { id: 'recent', owner_user_id: 'u1', deleted_at: daysAgo(29) },
        { id: 'live', owner_user_id: 'u1', deleted_at: null },
      ],
      assets: [],
    });
    expect(await purgeExpiredReleases(client, NOW)).toEqual({ purged: 1, failed: 0 });
    expect(tables.releases.map((r) => r.id).sort()).toEqual(['live', 'recent']);
  });
});

describe('the delete route and AI hold the double confirmation', () => {
  const root = join(__dirname, '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('DELETE /api/releases/[id] refuses without the typed confirmation', () => {
    const route = read('app/api/releases/[releaseId]/route.ts');
    expect(route).toContain('matchesDeleteConfirmation(body?.confirmation');
    expect(route).toContain('softDeleteRelease(');
    expect(route).not.toMatch(/\.from\('releases'\)\s*\.delete\(\)/);
  });

  it('AI delete_release proposes a typed confirmation and forwards what the user typed', () => {
    const tool = read('lib/chappi/tool-families/releases.ts');
    expect(tool).toContain('typedConfirmation: { phrase: release.title }');
    expect(tool).toContain("argString(args, 'confirmation')");
  });

  it('the confirmation card keeps the button off until the phrase matches', () => {
    const card = read('components/chappi/ChappiConfirmationCard.tsx');
    expect(card).toContain('matchesDeleteConfirmation(confirmation, typed.phrase)');
    expect(card).toContain('disabled={isBusy || !confirmed}');
  });
});
