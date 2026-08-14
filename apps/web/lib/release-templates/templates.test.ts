import { describe, expect, it } from 'vitest';

import { ALBUM_RELEASE_TEMPLATE } from './album';
import { EP_RELEASE_TEMPLATE } from './ep';
import { SINGLE_RELEASE_TEMPLATE } from './single';
import type { Template } from './types';
import { derivePlanPhase, MAX_DRAFT_TASKS, type PlanPhase } from '../release-planning';

// Templates are hand-written data, and the failure modes are all silent: a
// typo'd depends_on id makes instantiateTemplate throw 'invalid_template' at
// release-creation time (where the create route only console.errors it, so the
// user just gets a release with no activities), an offset outside the planner's
// window makes an approved plan unsavable, and a phase with no tasks renders an
// empty section in the review scene. Each assertion here is one of those.
//
// Deliberately imports the template modules directly rather than going through
// the loader: this is about whether the DATA is well formed, which has nothing
// to do with whether NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES is on.
const TEMPLATES: Array<[string, Template]> = [
  ['single', SINGLE_RELEASE_TEMPLATE],
  ['ep', EP_RELEASE_TEMPLATE],
  ['album', ALBUM_RELEASE_TEMPLATE],
];

// Mirrors MIN_TASK_OFFSET / MAX_TASK_OFFSET in release-planning.ts, which are
// module-private. A template outside this window can be instantiated directly
// but cannot survive a planner draft round trip, so the bound belongs here too.
const MIN_TASK_OFFSET = -120;
const MAX_TASK_OFFSET = 60;

describe.each(TEMPLATES)('%s template integrity', (name, template) => {
  it('declares a release type and an id/version that agree', () => {
    expect(template.release_type).toBe(name);
    expect(template.tasks.length).toBeGreaterThan(0);
    // id convention is `{release_type}_v{major}.{minor}`, and the semver
    // version has to start with the same numbers or the two records of "which
    // playbook made this plan" disagree in stored task metadata.
    const match = /^(.+)_v(\d+)\.(\d+)$/.exec(template.id);
    expect(match, `template id '${template.id}' does not match {type}_v{major}.{minor}`).not.toBeNull();
    const [, idType, major, minor] = match as RegExpExecArray;
    expect(idType).toBe(name);
    expect(template.version).toBe(`${major}.${minor}.0`);
  });

  it('has unique task ids', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const task of template.tasks) {
      if (seen.has(task.id)) duplicates.push(task.id);
      seen.add(task.id);
    }
    // instantiateTemplate rejects the whole template on a duplicate id.
    expect(duplicates).toEqual([]);
    expect(seen.size).toBe(template.tasks.length);
  });

  it('only depends on task ids that exist in the same template', () => {
    const ids = new Set(template.tasks.map((task) => task.id));
    const broken: string[] = [];
    for (const task of template.tasks) {
      for (const dependency of task.depends_on ?? []) {
        if (!ids.has(dependency)) broken.push(`${task.id} -> ${dependency}`);
        if (dependency === task.id) broken.push(`${task.id} -> itself`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('keeps every offset inside the planner window', () => {
    for (const task of template.tasks) {
      expect(
        task.offset_days,
        `${task.id} offset ${task.offset_days} is outside ${MIN_TASK_OFFSET}..${MAX_TASK_OFFSET}`
      ).toBeGreaterThanOrEqual(MIN_TASK_OFFSET);
      expect(task.offset_days).toBeLessThanOrEqual(MAX_TASK_OFFSET);
      expect(Number.isInteger(task.offset_days)).toBe(true);
    }
  });

  it('gives every task at least one day of duration', () => {
    for (const task of template.tasks) {
      expect(task.duration_days, `${task.id} duration`).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(task.duration_days)).toBe(true);
    }
  });

  it('fits inside a single plan draft', () => {
    // A draft over MAX_DRAFT_TASKS cannot be saved, so the planner would
    // generate a plan the manager could never approve.
    expect(template.tasks.length).toBeLessThanOrEqual(MAX_DRAFT_TASKS);
  });

  it('puts work in all four plan phases', () => {
    const phases = new Set<PlanPhase>(
      template.tasks.map((task) => derivePlanPhase(task.offset_days))
    );
    expect([...phases].sort()).toEqual([
      'post_release',
      'pre_release',
      'release_week',
      'setup',
    ]);
  });

  it('marks release day with at least one event milestone', () => {
    const releaseDay = template.tasks.filter((task) => task.offset_days === 0);
    expect(releaseDay.length).toBeGreaterThan(0);
    expect(releaseDay.some((task) => task.type === 'event_milestone')).toBe(true);
  });

  it('has non-empty titles and descriptions on every task', () => {
    for (const task of template.tasks) {
      expect(task.title.trim().length, `${task.id} title`).toBeGreaterThan(0);
      expect(task.description.trim().length, `${task.id} description`).toBeGreaterThan(0);
    }
  });
});

describe('staggered-single templates', () => {
  it('drops the EP lead single six weeks before the EP', () => {
    const drop = EP_RELEASE_TEMPLATE.tasks.find((task) => task.id === 'w6_lead_single_drop');
    expect(drop?.type).toBe('event_milestone');
    expect(drop?.offset_days).toBe(-42);
    // The EP editorial pitch is the reason the single goes first: it depends on
    // the single's numbers, so it must land after the drop.
    const pitch = EP_RELEASE_TEMPLATE.tasks.find((task) => task.id === 'w5_ep_editorial_pitch');
    expect(pitch?.offset_days).toBeGreaterThan(drop?.offset_days as number);
    expect(pitch?.depends_on).toContain('w6_single_first_numbers');
  });

  it('staggers both album singles ahead of the album', () => {
    const first = ALBUM_RELEASE_TEMPLATE.tasks.find((task) => task.id === 'w12_single_1_drop');
    const second = ALBUM_RELEASE_TEMPLATE.tasks.find((task) => task.id === 'w6_single_2_drop');
    expect(first?.type).toBe('event_milestone');
    expect(second?.type).toBe('event_milestone');
    expect(first?.offset_days).toBe(-84);
    expect(second?.offset_days).toBe(-42);
    // The album pitch rests on BOTH singles' numbers — that combined evidence
    // is the entire argument for staggering the campaign.
    const pitch = ALBUM_RELEASE_TEMPLATE.tasks.find(
      (task) => task.id === 'w5_album_editorial_pitch'
    );
    expect(pitch?.depends_on).toEqual(
      expect.arrayContaining(['w12_single_1_first_numbers', 'w6_single_2_first_numbers'])
    );
  });

  it('gives the album a longer runway than the EP, and the EP than the single', () => {
    const earliest = (template: Template) =>
      Math.min(...template.tasks.map((task) => task.offset_days));
    expect(earliest(ALBUM_RELEASE_TEMPLATE)).toBeLessThan(earliest(EP_RELEASE_TEMPLATE));
    expect(earliest(EP_RELEASE_TEMPLATE)).toBeLessThan(earliest(SINGLE_RELEASE_TEMPLATE));
  });
});
