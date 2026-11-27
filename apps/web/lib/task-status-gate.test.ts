import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  completionNeedsBlockerCheck,
  decideTaskStatusChange,
  isKnownTaskStatus,
} from '@/lib/task-status-gate';
import { TASK_STATUS_OPTIONS } from '@/types/tasks';

describe('isKnownTaskStatus', () => {
  it('accepts every status the product has', () => {
    for (const status of TASK_STATUS_OPTIONS) expect(isKnownTaskStatus(status)).toBe(true);
  });

  it('rejects anything else, including non-strings', () => {
    for (const bad of ['finished', 'DONE', '', null, undefined, 3, {}]) {
      expect(isKnownTaskStatus(bad)).toBe(false);
    }
  });
});

describe('completionNeedsBlockerCheck', () => {
  it('is true only for a move into done', () => {
    expect(completionNeedsBlockerCheck('todo', 'done')).toBe(true);
    expect(completionNeedsBlockerCheck('locked', 'done')).toBe(true);
    expect(completionNeedsBlockerCheck(null, 'done')).toBe(true);
  });

  it('is false when leaving done, staying done, or going anywhere else', () => {
    expect(completionNeedsBlockerCheck('done', 'done')).toBe(false);
    expect(completionNeedsBlockerCheck('done', 'todo')).toBe(false);
    expect(completionNeedsBlockerCheck('todo', 'in_progress')).toBe(false);
    expect(completionNeedsBlockerCheck('locked', 'todo')).toBe(false);
  });
});

describe('decideTaskStatusChange', () => {
  it('refuses an unknown status with a 400 that lists the real ones', () => {
    const result = decideTaskStatusChange({ from: 'todo', to: 'finished' });
    expect(result).toMatchObject({ ok: false, status: 400, reason: 'unknown_status' });
    if (!result.ok) expect(result.message).toContain('in_progress');
  });

  it('refuses a non-string status', () => {
    expect(decideTaskStatusChange({ from: 'todo', to: null })).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a move into done while something holds it up, with the blocker as the message', () => {
    const result = decideTaskStatusChange({
      from: 'locked',
      to: 'done',
      blocker: 'Complete the dependency chain first.',
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      reason: 'blocked',
      message: 'Complete the dependency chain first.',
    });
  });

  it('allows a move into done when nothing holds it up', () => {
    expect(decideTaskStatusChange({ from: 'todo', to: 'done', blocker: null })).toEqual({ ok: true });
    expect(decideTaskStatusChange({ from: 'todo', to: 'done' })).toEqual({ ok: true });
  });

  it('never gates undoing a tick, even with a blocker passed in', () => {
    expect(decideTaskStatusChange({ from: 'done', to: 'todo', blocker: 'Waiting on X.' })).toEqual({ ok: true });
    expect(decideTaskStatusChange({ from: 'done', to: 'in_progress', blocker: 'Waiting on X.' })).toEqual({ ok: true });
  });

  it('never gates re-sending done on a task that is already done', () => {
    expect(decideTaskStatusChange({ from: 'done', to: 'done', blocker: 'Waiting on X.' })).toEqual({ ok: true });
  });

  it('does not gate other moves, including the unlock the app writes (locked to todo)', () => {
    expect(decideTaskStatusChange({ from: 'locked', to: 'todo', blocker: 'Waiting on X.' })).toEqual({ ok: true });
    expect(decideTaskStatusChange({ from: 'todo', to: 'cancelled', blocker: 'Waiting on X.' })).toEqual({ ok: true });
  });
});

// The rule is only worth having if the route uses it, and nothing in vitest
// reaches a route handler. So read the source (comments stripped, so prose
// cannot satisfy it), the way tier-limits-guard.test.ts does for its doors.
describe('PATCH /api/tasks/[id] uses the rule', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/tasks/[id]/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('decides every status change through decideTaskStatusChange', () => {
    expect(source).toMatch(/decideTaskStatusChange\(/);
  });

  it('only loads the blocker for a move into done', () => {
    expect(source).toMatch(/completionNeedsBlockerCheck\(/);
    expect(source).toMatch(/getCompletionBlocker\(/);
  });

  it('answers with the rule status, not a made-up one', () => {
    expect(source).toMatch(/decision\.status/);
  });
});
