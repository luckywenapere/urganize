import { describe, expect, it } from 'vitest';
import { getAuthoredTemplate } from './release-templates/loader';
import {
  DIRECTORY_ROLES,
  DIRECTORY_ROLE_LABELS,
  VERIFIABLE_ROLES,
  DELIVERY_TASK_ROLE,
  HIRING_TASK_ROLE,
  roleForTemplateTask,
  roleNeededForTask,
} from './directory-roles';

/**
 * The role vocabulary, and the allowlist that decides what the product is
 * willing to say somebody delivered.
 *
 * The templates.test.ts precedent: assert the allowlist against the LIVE
 * playbooks, so a renamed or deleted template step fails here rather than
 * quietly costing a person their record.
 */

// getAuthoredTemplate, not getTemplate, and that is deliberate. EP and album
// sit behind NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES, but a delivery record
// written while that flag was on still names an EP task id, so the map has to
// cover all three playbooks whatever the flag says today. It is the same
// reason the plan autosave reads that accessor.
const PLAYBOOK_TASK_IDS: ReadonlySet<string> = new Set(
  (['single', 'ep', 'album'] as const)
    .map((type) => getAuthoredTemplate(type))
    .filter((template): template is NonNullable<typeof template> => Boolean(template))
    .flatMap((template) => template.tasks.map((task) => task.id))
);

describe('directory roles', () => {
  it('labels every role in the vocabulary', () => {
    for (const role of DIRECTORY_ROLES) {
      expect(DIRECTORY_ROLE_LABELS[role]).toBeTruthy();
    }
    expect(new Set(DIRECTORY_ROLES).size).toBe(DIRECTORY_ROLES.length);
  });

  it('maps only task ids that exist in a live playbook', () => {
    // The whole point of an allowlist over a title pattern. A typo or a
    // renamed step is a failing test, not a role that silently stops being
    // verifiable.
    const unknown = Object.keys(DELIVERY_TASK_ROLE).filter((id) => !PLAYBOOK_TASK_IDS.has(id));
    expect(unknown).toEqual([]);
  });

  it('maps every task to a role in the vocabulary', () => {
    const strays = Object.values(DELIVERY_TASK_ROLE).filter(
      (role) => !DIRECTORY_ROLES.includes(role)
    );
    expect(strays).toEqual([]);
  });

  it('covers each verifiable role in all three playbooks', () => {
    // A role that only a single release can earn would be invisible to
    // everyone running an EP or an album, which reads as the product being
    // broken rather than as a deliberate gap.
    for (const role of VERIFIABLE_ROLES) {
      for (const type of ['single', 'ep', 'album'] as const) {
        const template = getAuthoredTemplate(type);
        expect(template, `${type} playbook missing`).toBeTruthy();
        const ids = new Set(template!.tasks.map((task) => task.id));
        const covered = Object.entries(DELIVERY_TASK_ROLE).some(
          ([id, mapped]) => mapped === role && ids.has(id)
        );
        expect(covered, `${role} has no ${type} task`).toBe(true);
      }
    }
  });

  it('derives the verifiable set from the map rather than restating it', () => {
    // Two hand-written lists would drift. VERIFIABLE_ROLES is what the map
    // actually reaches, so adding a task id is the only way to add a role.
    expect([...VERIFIABLE_ROLES].sort()).toEqual(
      [...new Set(Object.values(DELIVERY_TASK_ROLE))].sort()
    );
  });

  it('never credits a briefing task', () => {
    // Briefing is when the work is COMMISSIONED. The manager writes the brief;
    // the designer has delivered nothing yet. Same exclusion, and the same
    // reasoning, as lib/cover-art-tasks.ts.
    const briefs = Object.keys(DELIVERY_TASK_ROLE).filter((id) => /brief|plan_/.test(id));
    expect(briefs).toEqual([]);
  });

  it('answers null for an unmapped or missing task id', () => {
    expect(roleForTemplateTask('w8_set_rollout_budget')).toBeNull();
    expect(roleForTemplateTask(null)).toBeNull();
    expect(roleForTemplateTask('')).toBeNull();
    expect(roleForTemplateTask('not_a_real_task')).toBeNull();
  });

  it('reads the artwork delivery steps as the designer', () => {
    expect(roleForTemplateTask('w6_cover_art_first_draft')).toBe('graphic_designer');
    expect(roleForTemplateTask('w10_ep_art_draft')).toBe('graphic_designer');
    expect(roleForTemplateTask('w14_album_art_draft')).toBe('graphic_designer');
  });
});

describe('hiring map', () => {
  it('maps only task ids that exist in a live playbook', () => {
    const unknown = Object.keys(HIRING_TASK_ROLE).filter((id) => !PLAYBOOK_TASK_IDS.has(id));
    expect(unknown).toEqual([]);
  });

  it('stays disjoint from the delivery map', () => {
    // While these two share no id, roleNeededForTask's lookup order cannot
    // matter. The day an id appears in both, that order starts deciding
    // whether a gap surfaces at the briefing step or a week later at delivery
    // — so the guard is disjointness rather than a comment about order.
    const overlap = Object.keys(HIRING_TASK_ROLE).filter((id) => id in DELIVERY_TASK_ROLE);
    expect(overlap).toEqual([]);
  });

  it('covers the designer and PR briefings in all three playbooks', () => {
    for (const role of ['graphic_designer', 'pr'] as const) {
      for (const type of ['single', 'ep', 'album'] as const) {
        const ids = new Set(getAuthoredTemplate(type)!.tasks.map((task) => task.id));
        const covered = Object.entries(HIRING_TASK_ROLE).some(
          ([id, mapped]) => mapped === role && ids.has(id)
        );
        expect(covered, `${role} has no ${type} briefing step`).toBe(true);
      }
    }
  });

  it('prefers the hiring signal, which is the earlier one', () => {
    expect(roleNeededForTask('w7_brief_designer')).toBe('graphic_designer');
    expect(roleNeededForTask('w6_cover_art_first_draft')).toBe('graphic_designer');
    expect(roleNeededForTask('w8_set_rollout_budget')).toBeNull();
  });
});
