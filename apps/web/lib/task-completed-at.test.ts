import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedAtPatch } from './task-completed-at';

const NOW = new Date('2026-10-18T10:00:00.000Z');

describe('completedAtPatch (URG-369)', () => {
  it('stamps the time an activity is ticked', () => {
    expect(completedAtPatch('todo', 'done', NOW)).toEqual({ completed_at: NOW.toISOString() });
    expect(completedAtPatch('in_progress', 'done', NOW)).toEqual({ completed_at: NOW.toISOString() });
    expect(completedAtPatch(null, 'done', NOW)).toEqual({ completed_at: NOW.toISOString() });
  });
  it('clears it on undo', () => {
    expect(completedAtPatch('done', 'todo', NOW)).toEqual({ completed_at: null });
    expect(completedAtPatch('done', 'in_progress', NOW)).toEqual({ completed_at: null });
  });
  it('leaves it alone when the status does not cross done', () => {
    expect(completedAtPatch('done', 'done', NOW)).toBeNull();
    expect(completedAtPatch('todo', 'in_progress', NOW)).toBeNull();
    expect(completedAtPatch('done', undefined, NOW)).toBeNull();
  });
  it('the task PATCH route applies it', () => {
    const source = readFileSync(path.join(__dirname, '..', 'app', 'api', 'tasks', '[id]', 'route.ts'), 'utf8');
    expect(source).toContain('completedAtPatch(');
  });
});
