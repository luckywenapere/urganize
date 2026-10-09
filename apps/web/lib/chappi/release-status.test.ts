import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import { assistantReleaseStatus, dayToDate } from './release-status';
import { formatWorkspaceSummary } from './workspace-summary';
import { formatReleaseContext } from './portable-context';

/**
 * UrgAns reports the same rollout status the Catalogue shows (2026-10-09,
 * v1.92.9). Nothing writes `released`, so the stored status reads "draft" for a
 * rollout that came out months ago; the assistant's snapshot told it every
 * rollout was a draft in every turn.
 */

const NOW = new Date('2026-10-09T09:00:00');
const TODAY = '2026-10-09';

describe('assistantReleaseStatus', () => {
  it('calls a rollout released once its release day has passed', () => {
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: '2026-09-09' }, { done: 58, total: 64 }, NOW)).toBe('released');
  });

  it('calls it released on release day itself', () => {
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: TODAY }, { done: 0, total: 64 }, NOW)).toBe('released');
  });

  it('keeps a future rollout as it was stored', () => {
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: '2026-12-01' }, { done: 3, total: 64 }, NOW)).toBe('draft');
    expect(assistantReleaseStatus({ status: 'in_progress', releaseDate: '2026-12-01' }, { done: 3, total: 64 }, NOW)).toBe('in_progress');
  });

  it('calls it released when every activity is done, even with no date', () => {
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: null }, { done: 64, total: 64 }, NOW)).toBe('released');
  });

  it('never calls an empty rollout released for having all of nothing done', () => {
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: null }, { done: 0, total: 0 }, NOW)).toBe('draft');
    expect(assistantReleaseStatus({ status: 'draft' }, { done: 0, total: 0 }, NOW)).toBe('draft');
  });

  it('lets the date alone decide when activities are not loaded', () => {
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: '2026-09-09' }, null, NOW)).toBe('released');
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: '2026-12-01' }, null, NOW)).toBe('draft');
    expect(assistantReleaseStatus({ status: 'draft', releaseDate: null }, null, NOW)).toBe('draft');
  });

  it('keeps archived archived, even past its date', () => {
    expect(assistantReleaseStatus({ status: 'archived', releaseDate: '2026-01-01' }, { done: 64, total: 64 }, NOW)).toBe('archived');
  });

  it('keeps a stored released as released', () => {
    expect(assistantReleaseStatus({ status: 'released', releaseDate: null }, null, NOW)).toBe('released');
  });
});

describe('dayToDate', () => {
  it('reads a day as local midnight', () => {
    const date = dayToDate('2026-10-09');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 9, 0]);
  });

  it('falls back to now for something that is not a day', () => {
    expect(Number.isFinite(dayToDate('nope').getTime())).toBe(true);
  });
});

describe('what the assistant is told', () => {
  const released = {
    id: 'r1',
    title: 'Midnight EP',
    status: 'draft',
    releaseDate: '2026-09-09',
    artistName: 'Tems',
    releaseType: 'ep',
    description: null,
    updatedAt: '2026-10-01T00:00:00Z',
  } as unknown as Release;
  const tasks = Array.from({ length: 4 }, (_, i) => ({
    id: `t${i}`,
    releaseId: 'r1',
    title: `Task ${i}`,
    status: i < 3 ? 'done' : 'todo',
    dueDate: null,
    taskType: 'task',
    assignedToUserId: null,
    assignedTo: null,
    updatedAt: '2026-10-01T00:00:00Z',
  })) as unknown as Task[];

  it('the workspace snapshot says released for a rollout that came out', () => {
    const out = formatWorkspaceSummary({ releases: [released], tasks, members: [], today: TODAY });
    expect(out).toContain('status: released, 3/4 tasks done');
    expect(out).not.toContain('status: draft');
  });

  it('the rollout context says released too', () => {
    const out = formatReleaseContext({ release: released, tasks, today: TODAY });
    expect(out).toContain('Status: released');
    expect(out).not.toContain('Status: draft');
  });
});

describe('every place the assistant reports a rollout status', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it.each([
    ['lib/chappi/workspace-summary.ts'],
    ['lib/chappi/portable-context.ts'],
    ['lib/chappi/tool-families/core.ts'],
    ['lib/chappi/tool-families/insights.ts'],
  ])('%s goes through assistantReleaseStatus, never the stored value', (path) => {
    const source = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).toContain('assistantReleaseStatus(');
    expect(source).not.toMatch(/status:\s*(?:r|release)\.status\b/);
    expect(source).not.toContain('Status: ${release.status}');
    expect(source).not.toContain('status: ${r.status}');
  });
});
