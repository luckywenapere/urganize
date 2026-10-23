import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TASK_COUNT_TIMEOUT_MS,
  describeReleaseDeletion,
  describeTaskCountStatus,
  fetchReleaseTaskCount,
  isDeleteBlockedByCount,
  parseReleaseTaskCount,
} from './delete-release-task-count';

/**
 * The delete-rollout confirmation must never read as "this rollout is empty"
 * unless the server said so (v1.92.2). It used to take its count from the
 * client task store, which read 0 for a 32-activity rollout the first time the
 * dialog opened, so the dialog said only "deletes the rollout and all attached
 * files".
 */

const ZERO_SENTENCE = describeReleaseDeletion({ status: 'known', count: 0 });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseReleaseTaskCount', () => {
  it('reads retention.taskCount from the rollout GET body', () => {
    expect(parseReleaseTaskCount({ release: {}, retention: { taskCount: 32 } })).toBe(32);
    expect(parseReleaseTaskCount({ retention: { taskCount: 0 } })).toBe(0);
  });

  it('treats anything else as unknown (null), never as 0', () => {
    for (const payload of [
      null,
      undefined,
      'x',
      {},
      { retention: null },
      { retention: {} },
      { retention: { taskCount: '32' } },
      { retention: { taskCount: -1 } },
      { retention: { taskCount: 1.5 } },
      { retention: { taskCount: Number.NaN } },
      { error: 'Could not load rollout retention state.' },
    ]) {
      expect(parseReleaseTaskCount(payload)).toBeNull();
    }
  });
});

describe('fetchReleaseTaskCount', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks GET /api/releases/[id] with the bearer token and returns the server count', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ retention: { taskCount: 32 } }));
    const state = await fetchReleaseTaskCount('rel 1', 'tok', { fetchImpl: fetchImpl as typeof fetch });
    expect(state).toEqual({ status: 'known', count: 32 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/releases/rel%201');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('returns a known zero only when the server says zero', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ retention: { taskCount: 0 } }));
    expect(await fetchReleaseTaskCount('r', 't', { fetchImpl: fetchImpl as typeof fetch })).toEqual({
      status: 'known',
      count: 0,
    });
  });

  it('is unknown, not zero, on a non-2xx answer, a bad body or a network error', async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => jsonResponse({ error: 'nope' }, 500),
      async () => jsonResponse({ error: 'Forbidden' }, 403),
      async () => jsonResponse({ release: {} }),
      async () => new Response('not json', { status: 200 }),
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ];
    for (const impl of cases) {
      const state = await fetchReleaseTaskCount('r', 't', { fetchImpl: vi.fn(impl) as typeof fetch });
      expect(state).toEqual({ status: 'unknown' });
    }
  });

  it('is unknown without a session token, and makes no request', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchReleaseTaskCount('r', '', { fetchImpl: fetchImpl as typeof fetch })).toEqual({
      status: 'unknown',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gives up after the timeout so deletion is never blocked forever', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>(() => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
          });
        })
    );
    const pending = fetchReleaseTaskCount('r', 't', { fetchImpl: fetchImpl as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(TASK_COUNT_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: 'unknown' });
    expect(aborted).toBe(true);
    expect(TASK_COUNT_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('describeReleaseDeletion', () => {
  it('names the count when the server gave one', () => {
    expect(describeReleaseDeletion({ status: 'known', count: 32 })).toBe(
      'It moves to Trash with its 32 activities. Nothing is lost for 30 days.'
    );
    expect(describeReleaseDeletion({ status: 'known', count: 1 })).toContain('its 1 activity.');
  });

  it('leaves activities out only for a known zero', () => {
    expect(ZERO_SENTENCE).toBe('It moves to Trash. Nothing is lost for 30 days.');
  });

  it('never words a loading or unknown count as an empty rollout', () => {
    for (const state of [{ status: 'loading' as const }, { status: 'unknown' as const }]) {
      const sentence = describeReleaseDeletion(state);
      expect(sentence).not.toBe(ZERO_SENTENCE);
      expect(sentence).toMatch(/activities/);
      expect(sentence).toMatch(/Nothing is lost for 30 days/);
    }
  });

  it('says what is happening while the count is not settled', () => {
    expect(describeTaskCountStatus({ status: 'loading' })).toMatch(/Counting/);
    expect(describeTaskCountStatus({ status: 'unknown' })).toMatch(/couldn\u2019t count/);
    expect(describeTaskCountStatus({ status: 'known', count: 3 })).toBeNull();
  });

  it('holds the Delete button only while loading', () => {
    expect(isDeleteBlockedByCount({ status: 'loading' })).toBe(true);
    expect(isDeleteBlockedByCount({ status: 'unknown' })).toBe(false);
    expect(isDeleteBlockedByCount({ status: 'known', count: 0 })).toBe(false);
  });
});

/**
 * Structural invariant (CLAUDE.md test pattern 4): scan the real sources.
 * The dialog asks the server itself, takes no count from a caller, and no
 * component that mounts it can hand it a client-store count again.
 */
const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));

function readSource(relative: string): string {
  return readFileSync(join(WEB_ROOT, relative), 'utf8');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(WEB_ROOT, dir))) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const rel = join(dir, entry);
    if (statSync(join(WEB_ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

describe('DeleteReleaseDialog takes its count from the server', () => {
  const dialog = readSource('components/workspace/DeleteReleaseDialog.tsx');

  it('fetches the count and renders the shared copy', () => {
    expect(dialog).toContain('fetchReleaseTaskCount(');
    expect(dialog).toContain('describeReleaseDeletion(taskCount)');
    expect(dialog).toContain('isDeleteBlockedByCount(taskCount)');
  });

  it('accepts no task count from a caller and never reads the task store', () => {
    expect(dialog).not.toMatch(/tasksTotal/);
    expect(dialog).not.toMatch(/useTaskStore/);
    expect(dialog).not.toMatch(/tasksTotal\s*>\s*0/);
  });

  it('no mount anywhere passes a count prop', () => {
    const mounts: string[] = [];
    for (const file of [...sourceFiles('components'), ...sourceFiles('app')]) {
      const source = readSource(file);
      let from = 0;
      for (;;) {
        const at = source.indexOf('<DeleteReleaseDialog', from);
        if (at === -1) break;
        const end = source.indexOf('/>', at);
        mounts.push(`${file}: ${source.slice(at, end)}`);
        from = end;
      }
    }
    // Settings' ReleasesSection and the workspace's test-rollout exit.
    expect(mounts.length).toBeGreaterThanOrEqual(2);
    for (const mount of mounts) {
      expect(mount).not.toMatch(/tasksTotal|taskCount|tasks\.filter|taskList\.filter/);
    }
  });

  it('the rollout GET still answers retention.taskCount with an exact head-only count', () => {
    const route = readSource('app/api/releases/[releaseId]/route.ts');
    expect(route).toMatch(/count:\s*'exact',\s*head:\s*true/);
    expect(route).toMatch(/\.eq\('release_id', releaseId\)/);
    expect(route).toMatch(/retention:\s*retentionSummary/);
  });
});
