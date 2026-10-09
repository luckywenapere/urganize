import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayStatus } from './catalogue-table';
import { distributionStripMode } from './distribution-strip-visibility';

// Fixed "today" so the date rule is deterministic (local midnight, the shared
// rule's own behaviour).
const now = new Date(2026, 9, 9, 21, 0, 0);
const base = { status: 'draft', releaseDate: null as string | null, tasksDone: 0, tasksTotal: 0 };

describe('distributionStripMode', () => {
  it('mounts nothing on an empty shell (no date, no activities), as since v1.91.1', () => {
    expect(distributionStripMode(base, now)).toBe('none');
  });

  it('shows the full readiness list on a draft that has not come out', () => {
    expect(distributionStripMode({ ...base, releaseDate: '2026-12-01' }, now)).toBe('full');
    expect(distributionStripMode({ ...base, tasksDone: 3, tasksTotal: 10 }, now)).toBe('full');
    expect(distributionStripMode({ ...base, status: 'in_progress', releaseDate: '2026-11-01', tasksDone: 5, tasksTotal: 20 }, now)).toBe('full');
  });

  // Regression (live app, 2026-10-09): a rollout dated Sep 9 2026 with 58 of
  // 64 activities done read Released in the Catalogue but its page still said
  // "Fix these before you order distribution" with 7 items.
  it('hides the readiness list on a rollout the Catalogue shows as Released (past date, activities left)', () => {
    const weekendWeather = { status: 'draft', releaseDate: '2026-09-09', tasksDone: 58, tasksTotal: 64 };
    expect(displayStatus(weekendWeather, now)).toBe('released');
    expect(distributionStripMode(weekendWeather, now)).toBe('rejections');
  });

  it('release day itself counts as Released', () => {
    expect(distributionStripMode({ ...base, releaseDate: '2026-10-09', tasksDone: 1, tasksTotal: 10 }, now)).toBe(
      'rejections'
    );
  });

  it('every activity done with no date counts as Released', () => {
    expect(distributionStripMode({ ...base, tasksDone: 12, tasksTotal: 12 }, now)).toBe('rejections');
  });

  it('a stored released status counts as Released', () => {
    expect(distributionStripMode({ ...base, status: 'released', releaseDate: '2026-12-01', tasksTotal: 4 }, now)).toBe(
      'rejections'
    );
  });

  it('leaves an archived rollout exactly as before (full), even with a past date', () => {
    expect(distributionStripMode({ ...base, status: 'archived', releaseDate: '2026-01-01', tasksDone: 10, tasksTotal: 10 }, now)).toBe(
      'full'
    );
  });

  it('agrees with displayStatus on every case it is given: released <=> readiness hidden', () => {
    const cases = [
      { ...base, releaseDate: '2026-09-09', tasksDone: 58, tasksTotal: 64 },
      { ...base, releaseDate: '2026-10-10', tasksDone: 58, tasksTotal: 64 },
      { ...base, status: 'ready', releaseDate: '2026-10-01', tasksDone: 0, tasksTotal: 3 },
      { ...base, status: 'planning', releaseDate: null, tasksDone: 2, tasksTotal: 2 },
      { ...base, status: 'archived', releaseDate: '2026-09-01', tasksDone: 1, tasksTotal: 1 },
      { ...base, releaseDate: 'not-a-date', tasksDone: 0, tasksTotal: 5 },
    ];
    for (const c of cases) {
      const released = displayStatus(c, now) === 'released';
      expect(distributionStripMode(c, now) === 'rejections').toBe(released);
    }
  });
});

// Structural guards: the banner's rule is wired where it is drawn, and reuses
// the Catalogue's derived status rather than a new definition.
describe('distribution strip wiring', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('derives Released from displayStatus, with no hand-rolled date check', () => {
    const src = read('lib/distribution-strip-visibility.ts');
    expect(src).toMatch(/from '\.\/catalogue-table'/);
    expect(src).toMatch(/displayStatus\(/);
    expect(src).not.toMatch(/setHours\(|isRecapEligible\(/);
  });

  it('WorkspaceView mounts the strip through distributionStripMode and passes showReadiness', () => {
    const src = read('components/workspace/WorkspaceView.tsx');
    expect(src).toMatch(/from '@\/lib\/distribution-strip-visibility'/);
    expect(src).toMatch(/distributionStripMode\(/);
    expect(src).toMatch(/distributionMode !== 'none'/);
    expect(src).toMatch(/showReadiness=\{distributionMode === 'full'\}/);
    // The old inline empty-shell check is folded into the shared rule.
    expect(src).not.toMatch(/const isEmptyShell =/);
  });

  it('the strip gates its readiness list on showReadiness', () => {
    const src = read('components/workspace/DistributionStatusStrip.tsx');
    expect(src).toMatch(/showReadiness = true/);
    expect(src).toMatch(/const showIssues = showReadiness && /);
  });
});
