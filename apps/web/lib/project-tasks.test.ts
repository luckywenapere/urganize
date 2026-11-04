import { describe, expect, it } from 'vitest';
import { decideTaskOwner, taskHref } from './project-tasks';

const R = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';

describe('decideTaskOwner', () => {
  it('a rollout task', () => {
    expect(decideTaskOwner({ releaseId: R })).toEqual({ value: { releaseId: R, recordId: null } });
  });
  it('a project task', () => {
    expect(decideTaskOwner({ recordId: P })).toEqual({ value: { releaseId: null, recordId: P } });
  });
  it('refuses both at once', () => {
    expect(decideTaskOwner({ releaseId: R, recordId: P })).toHaveProperty('error');
  });
  it('refuses neither', () => {
    expect(decideTaskOwner({})).toHaveProperty('error');
    expect(decideTaskOwner({ releaseId: '', recordId: null })).toHaveProperty('error');
  });
  it('refuses a project id that is not an id', () => {
    expect(decideTaskOwner({ recordId: 'nope' })).toHaveProperty('error');
  });
});

describe('taskHref', () => {
  it('a rollout task opens the rollout', () => {
    expect(taskHref({ releaseId: R, record: null })).toBe(`/dashboard?release=${R}`);
  });
  it('a project task opens the project page', () => {
    expect(taskHref({ releaseId: null, record: { id: P, artistId: 'a1' } })).toBe(`/dashboard/a1/records/${P}`);
  });
  it('falls back to the dashboard when nothing is known', () => {
    expect(taskHref({ releaseId: null, record: null })).toBe('/dashboard');
    expect(taskHref({ releaseId: null, record: { id: P, artistId: '' } })).toBe('/dashboard');
  });
});

describe('one rule for every way a task is made', () => {
  it('the add-a-task route and the AI create_task both decide the owner with decideTaskOwner', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const file of ['app/api/tasks/route.ts', 'lib/chappi/tool-families/core.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).toContain('decideTaskOwner(');
    }
  });
});
