// Rollout Trash: list and count read paths hide deleted rollouts.
// A fake admin client applies the chained filters to canned rows, so these
// tests fail if `.is('deleted_at', null)` is dropped from a query.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/cover-art', () => ({
  loadCoverArtUrls: async () => new Map(),
}));
vi.mock('@/lib/workspace-logo', () => ({
  loadWorkspaceLogoFallbackUrl: async () => null,
}));

import { ReleaseService } from '@/lib/services/release-service';
import { countArtistDeletionBlockers } from '@/lib/artists-server';

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let head = false;
    const builder: Record<string, unknown> = {};
    const chain = (op: string, apply?: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        calls.push({ table, op, args });
        apply?.(...args);
        return builder;
      };
    builder.select = chain('select', (_cols, opts) => {
      head = Boolean((opts as { head?: boolean } | undefined)?.head);
    });
    builder.in = chain('in', (col, vals) => {
      rows = rows.filter((r) => (vals as unknown[]).includes(r[col as string]));
    });
    builder.eq = chain('eq', (col, val) => {
      rows = rows.filter((r) => r[col as string] === val);
    });
    builder.neq = chain('neq', (col, val) => {
      rows = rows.filter((r) => r[col as string] !== val);
    });
    builder.is = chain('is', (col, val) => {
      rows = rows.filter((r) => (r[col as string] ?? null) === val);
    });
    builder.order = chain('order');
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: head ? null : rows, count: rows.length, error: null });
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const live = { id: 'r-live', owner_user_id: 'u1', artist_id: 'a1', title: 'Live', deleted_at: null };
const gone = {
  id: 'r-gone',
  owner_user_id: 'u1',
  artist_id: 'a1',
  title: 'Gone',
  deleted_at: '2026-10-20T10:00:00Z',
};

describe('ReleaseService.getReleasesForUser', () => {
  it('returns live rollouts and hides deleted ones', async () => {
    const { client, calls } = fakeAdmin({ releases: [live, gone] });
    const result = await new ReleaseService(client).getReleasesForUser('u1');
    expect(result.map((r) => r.id)).toEqual(['r-live']);
    expect(calls).toContainEqual({ table: 'releases', op: 'is', args: ['deleted_at', null] });
  });

  it('hides deleted rollouts of other visible owners too', async () => {
    const other = { ...gone, id: 'r-other-gone', owner_user_id: 'u2' };
    const otherLive = { ...live, id: 'r-other-live', owner_user_id: 'u2' };
    const { client } = fakeAdmin({ releases: [live, gone, other, otherLive] });
    const result = await new ReleaseService(client).getReleasesForUser('u1', ['u2']);
    expect(result.map((r) => r.id).sort()).toEqual(['r-live', 'r-other-live']);
  });
});

describe('countArtistDeletionBlockers', () => {
  // releases.artist_id is ON DELETE RESTRICT, so a rollout in Trash still pins
  // its artist: it must keep counting, or the delete would fail on the FK.
  it('counts rollouts in Trash too', async () => {
    const { client } = fakeAdmin({ releases: [live, gone], workspace_members: [] });
    expect(await countArtistDeletionBlockers(client, 'a1')).toEqual({ releases: 2, scopedMembers: 0 });
  });

  it('blocks when the only rollout of the artist is in Trash', async () => {
    const { client } = fakeAdmin({ releases: [gone], workspace_members: [] });
    expect(await countArtistDeletionBlockers(client, 'a1')).toEqual({ releases: 1, scopedMembers: 0 });
  });
});

// Structural invariant: every list/count query on `releases` in these files
// carries the deleted_at filter. By-id reads and writes are listed as exempt.
describe('read paths that list or count rollouts filter deleted_at', () => {
  const root = join(__dirname, '..');
  const files = [
    'lib/activation-server.ts',
    'lib/release-cap-server.ts',
    'lib/team-billing-server.ts',
    'lib/credits/first-plan-server.ts',
    'lib/self-serve-checklist-server.ts',
    'lib/press-kit-autofill-server.ts',
    'lib/email/audience-server.ts',
    'lib/directory-growth-server.ts',
    'app/api/billing/wall-summary/route.ts',
    'app/api/workspace/invite-gate/route.ts',
    'app/api/workspace/share-reward/route.ts',
    'app/api/curator/join/[code]/route.ts',
  ];
  for (const file of files) {
    it(`${file} excludes deleted rollouts`, () => {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src).toMatch(/\.is\('deleted_at', null\)/);
    });
  }
});
