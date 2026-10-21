import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PLANNER_PREVIEW_COPY,
  PREVIEW_EXAMPLE_LIMIT,
  buildPlannerTemplatePreview,
  previewSourceLine,
  previewSummaryLine,
} from './planner-template-preview';
import { getPlannerTemplate } from './release-planning-actions-server';
import { DATED_ROLLOUT_PHASES, ROLLOUT_PHASE_LABELS, rolloutPhaseForOffset } from './rollout-phases';
import { ALBUM_RELEASE_TEMPLATE } from './release-templates/album';
import { EP_RELEASE_TEMPLATE } from './release-templates/ep';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import type { Template } from './release-templates/types';
import { BANNED_COPY_CHARS, BANNED_COPY_WORDS } from './press-kits';

/**
 * The free plan preview on the planner's first question (v1.92.0).
 *
 * Two promises are held here: every number and name on the card comes from
 * the hand-written playbook the plan will start from, and building the card
 * spends nothing (no request, no model, no credits).
 */

const WEB = join(__dirname, '..');
const read = (path: string) => readFileSync(join(WEB, path), 'utf8');

const TYPES = ['single', 'ep', 'album'] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function expectBuiltFrom(template: Template, releaseType: (typeof TYPES)[number]) {
  const preview = buildPlannerTemplatePreview(releaseType);
  expect(preview.templateId).toBe(template.id);
  expect(preview.activityCount).toBe(template.tasks.length);

  // Phase counts are the playbook's own tasks, bucketed by the plan's phase rule.
  for (const phase of preview.phases) {
    const expected = template.tasks.filter((task) => rolloutPhaseForOffset(task.offset_days) === phase.phase).length;
    expect(phase.count).toBe(expected);
    expect(phase.label).toBe(ROLLOUT_PHASE_LABELS[phase.phase]);
  }
  expect(preview.phases.reduce((sum, phase) => sum + phase.count, 0)).toBe(template.tasks.length);
  // In plan order, and no empty phase is shown.
  const order = preview.phases.map((phase) => DATED_ROLLOUT_PHASES.indexOf(phase.phase));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(preview.phases.every((phase) => phase.count > 0)).toBe(true);

  // Every example is a real title from this playbook, at most one per phase.
  const titles = new Set(template.tasks.map((task) => task.title));
  expect(preview.examples.length).toBeGreaterThan(0);
  expect(preview.examples.length).toBeLessThanOrEqual(PREVIEW_EXAMPLE_LIMIT);
  for (const example of preview.examples) expect(titles.has(example)).toBe(true);
  const examplePhases = preview.examples.map((title) =>
    rolloutPhaseForOffset(template.tasks.find((task) => task.title === title)!.offset_days)
  );
  expect(new Set(examplePhases).size).toBe(examplePhases.length);
  return preview;
}

describe('buildPlannerTemplatePreview', () => {
  it('builds the single preview from the single playbook', () => {
    const preview = expectBuiltFrom(SINGLE_RELEASE_TEMPLATE, 'single');
    expect(preview.usesSinglePlaybook).toBe(false);
    expect(preview.phases.map((phase) => phase.label)).toEqual([
      'Pre-release',
      'Release',
      'Post-release',
    ]);
    // The first required activity of the playbook leads the examples.
    expect(preview.examples[0]).toBe(SINGLE_RELEASE_TEMPLATE.tasks.find((task) => !task.optional)!.title);
  });

  it('shows the single playbook for an EP or album while their playbooks are off', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES', 'false');
    for (const type of ['ep', 'album'] as const) {
      const preview = expectBuiltFrom(SINGLE_RELEASE_TEMPLATE, type);
      expect(preview.usesSinglePlaybook).toBe(true);
      expect(previewSourceLine(preview)).toContain('single playbook for now');
    }
  });

  it('uses the EP and album playbooks when they are on', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES', 'true');
    expect(expectBuiltFrom(EP_RELEASE_TEMPLATE, 'ep').usesSinglePlaybook).toBe(false);
    expect(expectBuiltFrom(ALBUM_RELEASE_TEMPLATE, 'album').usesSinglePlaybook).toBe(false);
  });

  it('picks the same playbook the plan route builds from, in both flag states', () => {
    for (const flag of ['false', 'true']) {
      vi.stubEnv('NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES', flag);
      for (const type of TYPES) {
        const route = getPlannerTemplate(type);
        const preview = buildPlannerTemplatePreview(type);
        expect(preview.templateId).toBe(route.template.id);
        expect(preview.usesSinglePlaybook).toBe(route.fallbackToSingle);
      }
    }
  });

  it('makes no request while building the preview', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES', 'true');
    for (const type of TYPES) buildPlannerTemplatePreview(type);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the preview spends nothing', () => {
  const SOURCES = ['lib/planner-template-preview.ts', 'components/planner/PlannerTemplatePreview.tsx'];
  // Anything that could reach the network, the model, the ledger or the database.
  const FORBIDDEN = [
    /\bfetch\(/,
    /urgans-actions/,
    /lib\/credits/,
    /createReleasePlan/,
    /supabase/,
    /\/api\//,
    /lib\/ai\//,
    /-server['"]/,
  ];

  for (const path of SOURCES) {
    it(`${path} reaches no request, model, credits or database`, () => {
      const source = read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const pattern of FORBIDDEN) expect(source, `${path} matches ${pattern}`).not.toMatch(pattern);
    });
  }

  it('the planner shows the preview on the first question it asks, beside the cost and the balance', () => {
    const modal = read('components/planner/PlannerIntakeModal.tsx');
    expect(modal).toMatch(/step === firstStep && draft\.releaseType \? \(\s*<PlannerTemplatePreview releaseType=\{draft\.releaseType\} \/>/);
    // The cost line with the balance is still there, so the balance shows next
    // to the preview on every width (the phone's top bar has no credits chip).
    expect(modal).toContain("embeddedCostLine('release.draft_plan', balance)");
  });
});

describe('preview copy', () => {
  const preview = buildPlannerTemplatePreview('single');
  const strings = [
    ...Object.values(PLANNER_PREVIEW_COPY),
    previewSummaryLine(preview),
    previewSourceLine(preview),
    previewSourceLine({ ...preview, releaseType: 'ep', usesSinglePlaybook: true }),
  ];

  it('says the real numbers and calls it the starting plan UrgAns tailors', () => {
    expect(previewSummaryLine(preview)).toBe(
      `${SINGLE_RELEASE_TEMPLATE.tasks.length} activities over ${preview.spanWeeks} weeks`
    );
    expect(previewSourceLine(preview)).toContain('UrgAns tailors it to your answers');
    expect(PLANNER_PREVIEW_COPY.noCharge).toContain('free');
  });

  it('follows the house copy rules', () => {
    for (const text of strings) {
      for (const char of BANNED_COPY_CHARS) expect(text).not.toContain(char);
      for (const word of BANNED_COPY_WORDS) expect(text).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
      expect(text).not.toMatch(/\bworkspaces?\b/i);
      expect(text).not.toMatch(/\bcredits?\b.*\d|\d.*\bcredits?\b/i);
    }
  });
});
