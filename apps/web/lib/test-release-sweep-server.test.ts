import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runTestReleaseSweep, MAX_TAGS_PER_RUN } from './test-release-sweep-server';
import { readTestRelease, readTestReleaseAuto } from './test-release';

const NOW = new Date('2026-11-28T08:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

type Release = {
  id: string;
  title: string | null;
  release_date: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  deleted_at?: string | null;
};
type Task = { release_id: string; status: string; created_at: string; updated_at: string };

// Enough of the supabase chain for the sweep: the paged release read, the
// paged task read by release id (capped at 1,000 rows a request, as PostgREST
// is), and the conditional metadata update by id.
function fakeClient(releases: Release[], tasks: Task[], opts: { failTasks?: boolean } = {}) {
  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  const byId = new Map(releases.map((r) => [r.id, r]));
  const client = {
    from(table: string) {
      if (table === 'releases') {
        let cutoff = '';
        return {
          select: function () {
            return this;
          },
          is: function () {
            return this;
          },
          lte: function (_col: string, value: string) {
            cutoff = value;
            return this;
          },
          order: function () {
            return this;
          },
          range: async (from: number, to: number) => ({
            data: releases.filter((r) => !r.deleted_at && r.created_at <= cutoff).slice(from, to + 1),
            error: null,
          }),
          update(values: Record<string, unknown>) {
            let id = '';
            const checks: Array<(r: Release) => boolean> = [];
            const meta = (r: Release, key: string) => (r.metadata ?? {})[key];
            const chain = {
              eq(col: string, value: string) {
                if (col === 'id') id = value;
                else {
                  const key = col.replace('metadata->>', '');
                  checks.push((r) => String(meta(r, key)) === value);
                }
                return chain;
              },
              is(col: string) {
                const key = col.replace('metadata->>', '');
                checks.push((r) => meta(r, key) === undefined || meta(r, key) === null);
                return chain;
              },
              select: async () => {
                const row = byId.get(id);
                if (!row || !checks.every((check) => check(row))) return { data: [], error: null };
                row.metadata = values.metadata as Record<string, unknown>;
                updates.push({ id, metadata: row.metadata });
                return { data: [{ id }], error: null };
              },
            };
            return chain;
          },
        };
      }
      let ids: string[] = [];
      return {
        select: function () {
          return this;
        },
        in: function (_col: string, value: string[]) {
          ids = value;
          return this;
        },
        order: function () {
          return this;
        },
        range: async (from: number, to: number) => {
          if (opts.failTasks) return { data: null, error: { message: 'boom' } };
          const all = tasks.filter((t) => ids.includes(t.release_id));
          const end = Math.min(to + 1, from + 1000);
          return { data: all.slice(from, end), error: null };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, updates };
}

const untouched = (releaseId: string): Task => ({
  release_id: releaseId,
  status: 'todo',
  created_at: daysAgo(20),
  updated_at: daysAgo(20),
});

describe('runTestReleaseSweep', () => {
  it('tags an old, untouched rollout with no name, and records that the sweep did it', async () => {
    const { client, updates } = fakeClient(
      [{ id: 'a', title: 'Untitled', release_date: null, created_at: daysAgo(20), metadata: { share_offered: true } }],
      [untouched('a')]
    );
    const result = await runTestReleaseSweep(client, NOW);
    expect(result.tagged).toBe(1);
    expect(updates).toHaveLength(1);
    expect(readTestRelease(updates[0].metadata)).toBe(true);
    expect(readTestReleaseAuto(updates[0].metadata)).toBe(true);
    expect(updates[0].metadata.share_offered).toBe(true);
  });

  it('leaves alone a rollout somebody has worked on, a real one, a new one and a dismissed one', async () => {
    const { client, updates } = fakeClient(
      [
        { id: 'worked', title: 'Untitled', release_date: null, created_at: daysAgo(20), metadata: null },
        { id: 'real', title: 'Go Up', release_date: '2026-12-25', created_at: daysAgo(20), metadata: null },
        { id: 'new', title: 'Untitled', release_date: null, created_at: daysAgo(2), metadata: null },
        { id: 'said-real', title: 'Untitled', release_date: null, created_at: daysAgo(20), metadata: { test_release_dismissed: true } },
        { id: 'already', title: 'Untitled', release_date: null, created_at: daysAgo(20), metadata: { test_release: true } },
      ],
      [{ release_id: 'worked', status: 'done', created_at: daysAgo(20), updated_at: daysAgo(19) }]
    );
    const result = await runTestReleaseSweep(client, NOW);
    expect(updates).toEqual([]);
    expect(result.tagged).toBe(0);
  });

  it('tags nothing when it cannot read the activities, rather than guess', async () => {
    const { client, updates } = fakeClient(
      [{ id: 'a', title: 'Untitled', release_date: null, created_at: daysAgo(20), metadata: null }],
      [],
      { failTasks: true }
    );
    const result = await runTestReleaseSweep(client, NOW);
    expect(updates).toEqual([]);
    expect(result.error).toContain('activities');
  });

  it('reads every activity even when there are more than 1,000 rows', async () => {
    // 20 rollouts with 64 activities each: 1,280 rows. Only the last activity
    // of the last rollout was worked on, so a capped read would miss it and
    // tag a rollout somebody is working on.
    const releases: Release[] = Array.from({ length: 20 }, (_, i) => ({
      id: `r${String(i).padStart(2, '0')}`,
      title: 'Untitled',
      release_date: null,
      created_at: daysAgo(20),
      metadata: null,
    }));
    const tasks: Task[] = releases.flatMap((r) => Array.from({ length: 64 }, () => untouched(r.id)));
    tasks[tasks.length - 1] = { ...tasks[tasks.length - 1], status: 'done' };
    const { client, updates } = fakeClient(releases, tasks);
    await runTestReleaseSweep(client, NOW);
    expect(updates.map((u) => u.id)).not.toContain('r19');
    expect(updates).toHaveLength(19);
  });

  it('lifts its own tag once the rollout reads as real, and never a tag a person set', async () => {
    const { client, updates } = fakeClient(
      [
        { id: 'turned-real', title: 'Go Up', release_date: '2026-12-25', created_at: daysAgo(20), metadata: { test_release: true, test_release_auto: true } },
        { id: 'person-set', title: 'Go Up', release_date: '2026-12-25', created_at: daysAgo(20), metadata: { test_release: true } },
      ],
      [
        { release_id: 'turned-real', status: 'done', created_at: daysAgo(20), updated_at: daysAgo(1) },
        { release_id: 'person-set', status: 'done', created_at: daysAgo(20), updated_at: daysAgo(1) },
      ]
    );
    const result = await runTestReleaseSweep(client, NOW);
    expect(result.cleared).toBe(1);
    expect(updates.map((u) => u.id)).toEqual(['turned-real']);
    expect(readTestRelease(updates[0].metadata)).toBe(false);
    expect(readTestReleaseAuto(updates[0].metadata)).toBe(false);
  });

  it('does not tag a rollout somebody said is real while the run was going', async () => {
    const releases: Release[] = [{ id: 'a', title: 'Untitled', release_date: null, created_at: daysAgo(20), metadata: null }];
    const { client, updates } = fakeClient(releases, []);
    // The owner taps "It's real, undo" after the sweep read the row.
    const original = client.from.bind(client);
    let armed = true;
    (client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      if (table === 'tasks' && armed) {
        armed = false;
        releases[0].metadata = { test_release_dismissed: true };
      }
      return original(table);
    };
    await runTestReleaseSweep(client, NOW);
    expect(updates).toEqual([]);
  });

  it('stops at the per-run ceiling', async () => {
    const many: Release[] = Array.from({ length: MAX_TAGS_PER_RUN + 5 }, (_, i) => ({
      id: `r${i}`,
      title: 'Untitled',
      release_date: null,
      created_at: daysAgo(20),
      metadata: null,
    }));
    const { client, updates } = fakeClient(many, []);
    const result = await runTestReleaseSweep(client, NOW);
    expect(result.tagged).toBe(MAX_TAGS_PER_RUN);
    expect(updates).toHaveLength(MAX_TAGS_PER_RUN);
  });
});
