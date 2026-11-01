import { describe, expect, it } from 'vitest';

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// The plan-ready dialog's assign loop (#1009) loads the way
// docs/notes/2026-11-01-stageshow-kit.md says. Structural: it reads the files.
describe('the assign loop in the plan-ready dialog (#1009)', () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');
  const wrapper = read('components/workspace/AssignTeamLoop.tsx');

  it('loads the kit lazily, client only', () => {
    expect(wrapper).toMatch(/dynamic\(\(\) => import\('\.\/assign-loop\/AssignLoop'\), \{\s*ssr: false,/);
    // Only the loop file may import the kit; anything else would pull it into the first load.
    for (const file of ['components/workspace/FirstReleaseWin.tsx', 'components/workspace/AssignTeamLoop.tsx']) {
      expect(read(file)).not.toContain('@urganize/stageshow');
    }
  });

  it('never mounts the loop under reduced motion', () => {
    expect(wrapper).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(wrapper).toContain('{motion ? (');
  });

  it('sits above the invite field, which stays the main action', () => {
    const dialog = read('components/workspace/FirstReleaseWin.tsx');
    const loop = dialog.indexOf('<AssignTeamLoop />');
    expect(loop).toBeGreaterThan(-1);
    expect(loop).toBeLessThan(dialog.indexOf('Teammate email'));
  });

  it('has a light and a dark poster for both scenes', () => {
    const dir = path.join(process.cwd(), 'public/images/first-win');
    for (const name of ['assign-light', 'assign-dark', 'assign-phone-light', 'assign-phone-dark']) {
      expect(statSync(path.join(dir, `${name}.webp`)).size).toBeGreaterThan(0);
    }
  });
});
