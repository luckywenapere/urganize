import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Rollout page, just-planned state (Oct 17, 2026; founder approved the mocks).
// Every cut is a hide: the components and their data stay, only where they
// render changes. vitest here is node-only, so this holds the rules at the source.
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8').replace(/\r\n/g, '\n');
const view = read('components/workspace/WorkspaceView.tsx');
const timeline = read('components/releases/TimelineScene.tsx');
const phases = read('components/workspace/RolloutPhases.tsx');

describe('just-planned rollout cuts', () => {
  it('no longer renders the plan-built banner, but keeps the component and its seen record', () => {
    expect(view).not.toContain('<PlanBuiltBanner');
    expect(view).toContain('usePlanBuiltSeen(');
    expect(read('components/planner/PlanBuiltBanner.tsx')).toContain('export function PlanBuiltBanner');
  });

  it('reads first steps once for the page and holds the distribution check, role gaps and pin back while it is up', () => {
    expect(view).toContain('useRolloutFirstSteps({');
    expect(view).toContain('<RolloutFirstSteps\n        state={firstSteps}');
    expect(view).toMatch(/distributionMode !== 'none' && !firstStepsUp/);
    expect(view).toMatch(/roleGaps\.length > 0 && !firstStepsUp \? \(\s*<RoleGapsPanel/);
    expect(view).toMatch(/pinnedConfirmDateCard = pinnedConfirmDateTask && !firstStepsUp/);
  });

  it('has no phone progress bar: the slim header keeps the count only (Oct 31, 2026)', () => {
    const header = read('components/workspace/RolloutPhoneHeader.tsx');
    expect(view).toContain('showMeta={bodyIsMainView}');
    expect(header).not.toContain('{done > 0 ? (');
  });

  it('keeps suggestions off the timeline (they live in Work the plan) and folds No date yet', () => {
    expect(timeline).not.toContain('PlanSuggestionsBlock');
    expect(read('components/workspace/TasksPanel.tsx')).toContain('<PhaseSuggestions');
    expect(timeline).toContain('aria-expanded={undatedOpen}');
  });

  it('draws one phase line on a phone and drops an undated Pre-production chip', () => {
    expect(phases).toContain('phasesForStrip(phases)');
    expect(phases).toContain('data-phase-line');
  });
});
