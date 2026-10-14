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
    expect(source).toMatch(/isDesktopViewport && timelineHasPlan\s*\?\s*scopedReleaseSlim\.id/);
    expect(source).toMatch(/const timelineIsFull =\s*timelineHasPlan &&/);
    expect(source).toMatch(/timelineIsFull \|\| !timelineHasPlan\s*\?\s*undefined/);
  });
});
