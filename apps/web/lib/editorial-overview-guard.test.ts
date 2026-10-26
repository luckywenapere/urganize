import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');

describe('the editorial overview', () => {
  const route = read('app/api/pitching/editorial/route.ts');
  const server = read('lib/editorial-overview-server.ts');
  it('checks the flag before auth and never writes', () => {
    expect(route.indexOf('isPitchingFeatureEnabled()')).toBeLessThan(route.indexOf('requireTeamUser('));
    expect(`${route}${server}`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
  it('filters every release through the shared access rule and fails closed', () => {
    expect(server).toContain('decideReleaseAccess');
    expect(server).toMatch(/if \(error\) return null/);
    expect(server).toMatch(/if \(taskError\) return null/);
  });
  // Pitching moved inside each rollout (2026-10-15): the Pitch tab mounts it.
  it('is mounted in the rollout Pitch tab', () => {
    expect(read('components/pitching/PitchScene.tsx')).toContain('<EditorialPitchSection releaseId={release.id}');
  });
});
