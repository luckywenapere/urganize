import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Planner v2's screen, read from the source (no component tests in this repo). */
const WEB = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');
const modal = read('components', 'planner', 'PlannerV2Modal.tsx');
const switcher = read('components', 'planner', 'PlannerIntakeModal.tsx');

describe('planner v2 UI', () => {
  it('opens behind its flag, v1 kept as the fallback', () => {
    expect(switcher).toContain('PLANNER_V2 ? <PlannerV2Modal /> : <PlannerIntakeModalV1 />');
  });

  it('has no release-date question for music not out (Oyin, 26 Oct 2026)', () => {
    expect(modal).not.toContain('<DateStep');
    expect(modal).not.toContain('Help me pick');
    expect(modal).toMatch(/case 'date':\s*if \(answers\.stage === 'out'\)/);
  });

  it('shows undated tasks relative to release in the preview', () => {
    expect(modal).toContain('relativeWhenLabel(task.offset_days, task.now)');
  });

  it('keeps the credits footer to one short line', () => {
    expect(modal).toContain("`Uses about ${embeddedEstimateCredits('release.draft_plan')} credits`");
    expect(modal).not.toContain('embeddedCostLine');
  });

  it('never says start free, sign up or get started', () => {
    expect(modal).not.toMatch(/start free|sign up|get started/i);
  });
});
