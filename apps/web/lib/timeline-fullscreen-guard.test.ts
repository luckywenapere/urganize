import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Founder, 2026-10-14: a rollout with no plan must not open onto a blank
// full-screen timeline (it hid the planner card). WorkspaceView is a component,
// and vitest here runs node-only, so this holds the rule at the source.
const source = readFileSync(join(__dirname, '..', 'components/workspace/WorkspaceView.tsx'), 'utf8');

describe('the timeline opens full screen only once there is a plan', () => {
  it('derives the gate from the rollout having activities', () => {
    expect(source).toMatch(/const timelineHasPlan = scopedTasks\.length > 0;/);
  });

  it('gates the automatic open, the full-screen state and the button on it', () => {
    expect(source).toMatch(/if \(!\(isDesktopViewport && timelineHasPlan\)\) return;/);
    expect(source).toMatch(/const timelineIsFull =\s*timelineHasPlan &&/);
    expect(source).toMatch(/timelineIsFull \|\| !timelineHasPlan\s*\?\s*undefined/);
  });
});

// URG-277 / URG-295 (2026-10-15): leaving full screen sticks for the visit. Only
// a change of rollout or tab may reset the one automatic open; a flicker in the
// viewport or the task list must not throw the person back in.
describe('exiting full screen sticks until they leave the timeline', () => {
  it('keys the visit to the rollout and the tab alone', () => {
    expect(source).toMatch(
      /const timelineVisitKey =\s*panelBody === 'timeline' && scopedReleaseSlim\?\.id \? scopedReleaseSlim\.id : null;/
    );
  });

  it('resets the automatic open only when the visit ends', () => {
    expect(source).toMatch(/if \(timelineVisitKey === null\) \{\s*autoFullKeyRef\.current = null;/);
  });
});

// URG-295 (2026-10-15): full screen keeps the top bar. It sits under the
// header's own tier inside the shell frame, so the six areas and the header's
// menus stay on screen and on top.
describe('full screen keeps the top bar on screen', () => {
  const overlay = readFileSync(join(__dirname, '..', 'components/releases/TimelineFullScreen.tsx'), 'utf8');
  const topNav = readFileSync(join(__dirname, '..', 'components/shell/TopNav.tsx'), 'utf8');

  it('portals into the shell frame, one tier under the sticky header', () => {
    expect(overlay).toMatch(/querySelector<HTMLElement>\('\.app-shell-frame'\)/);
    expect(overlay).toMatch(/'z-\[29\]'/);
    expect(topNav).toMatch(/<header data-shell-topbar className="shell-band sticky top-0 z-30/);
  });

  it('starts at the measured bottom of the top bar and traps nothing', () => {
    expect(overlay).toMatch(/querySelector<HTMLElement>\('\[data-shell-topbar\]'\)/);
    expect(overlay).not.toMatch(/aria-modal="true"\s*$/m);
    expect(overlay).not.toMatch(/useDialogFocus/);
  });
});
