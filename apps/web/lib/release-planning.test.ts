import { describe, expect, it } from 'vitest';

import { ALBUM_RELEASE_TEMPLATE } from './release-templates/album';
import { EP_RELEASE_TEMPLATE } from './release-templates/ep';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import { getTemplateLeadTimeDays } from './release-templates/loader';
import {
  applyDeltaToDraft,
  applyOwnerProposals,
  buildDraftFromTemplate,
  buildPlannerMessages,
  computeTaskYmd,
  derivePlanPhase,
  deriveScheduleWarnings,
  formatYmd,
  offsetFromTaskYmd,
  parseDraftDoc,
  parsePlannerAiDelta,
  parseReleasePlanIntake,
  resetPhaseToTemplate,
  suggestReleaseDate,
  toPromptTasks,
  validatePlannerDelta,
  type PlannerAiDelta,
  type PlanPhase,
  type ReleasePlanIntake,
} from './release-planning';

// The planner's correctness rests on three things a model cannot be trusted
// with: which phase a task belongs to, which tasks may be dropped, and the
// arithmetic between an offset and a real date. Those are what this file
// covers.

const OWNER = '11111111-1111-1111-1111-111111111111';
const TEAMMATE = '22222222-2222-2222-2222-222222222222';

const baseIntake: ReleasePlanIntake = {
  version: 2,
  release_type: 'single',
  artist_name: 'Tola',
  date_mode: 'fixed',
  release_date: '2026-10-02',
  ready_today: ['master'],
  goal: 'playlist_adds',
  budget: 'under_100k',
};

const buildBaseDraft = () =>
  buildDraftFromTemplate({
    template: SINGLE_RELEASE_TEMPLATE,
    intake: baseIntake,
    ownerUserId: OWNER,
    generatedAt: '2026-08-10T09:00:00.000Z',
  });

const emptyDelta = (): PlannerAiDelta => ({
  drops: [],
  adjust_offsets: [],
  role_assignments: [],
  rewrite_why: [],
  warnings: [],
  rationale: '',
});

describe('parseReleasePlanIntake', () => {
  it('accepts a complete set of answers', () => {
    const result = parseReleasePlanIntake(baseIntake);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.release_type).toBe('single');
  });

  it('rejects the Phase 5 release_context shape instead of misreading it', () => {
    // Rows written before the planner hold artist_scale / marketing_budget /
    // distributor_type. They must fall through to "no saved answers", never
    // half-populate the intake.
    const legacy = {
      artist_scale: 'emerging',
      marketing_budget: 'small',
      distributor_type: 'indie_distributor',
    };
    expect(parseReleasePlanIntake(legacy).ok).toBe(false);
  });

  it.each([
    ['release_type', { ...baseIntake, release_type: 'music_video' }],
    ['goal', { ...baseIntake, goal: 'world_domination' }],
    ['budget', { ...baseIntake, budget: '1_million' }],
    ['date_mode', { ...baseIntake, date_mode: 'guessed' }],
    ['ready_today entry', { ...baseIntake, ready_today: ['master', 'merch'] }],
  ])('rejects an unknown %s', (_field, payload) => {
    expect(parseReleasePlanIntake(payload).ok).toBe(false);
  });

  it('requires an artist name', () => {
    expect(parseReleasePlanIntake({ ...baseIntake, artist_name: '   ' }).ok).toBe(false);
  });

  it('lets "none of it yet" win over every other readiness answer', () => {
    const result = parseReleasePlanIntake({
      ...baseIntake,
      ready_today: ['master', 'none', 'artwork'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.ready_today).toEqual(['none']);
  });

  it('deduplicates readiness answers and keeps a stable order', () => {
    const result = parseReleasePlanIntake({
      ...baseIntake,
      ready_today: ['distributor', 'master', 'master'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.ready_today).toEqual(['master', 'distributor']);
  });

  it('accepts a null release date but rejects a malformed one', () => {
    expect(parseReleasePlanIntake({ ...baseIntake, release_date: null }).ok).toBe(true);
    expect(parseReleasePlanIntake({ ...baseIntake, release_date: '02/10/2026' }).ok).toBe(false);
    expect(parseReleasePlanIntake({ ...baseIntake, release_date: '2026-02-31' }).ok).toBe(false);
  });

  it('trims and caps the free text fields', () => {
    const result = parseReleasePlanIntake({
      ...baseIntake,
      goal_text: `  ${'g'.repeat(400)}  `,
      extra_notes: 'n'.repeat(2500),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intake.goal_text).toHaveLength(300);
      expect(result.intake.extra_notes).toHaveLength(2000);
    }
  });
});

describe('derivePlanPhase', () => {
  it.each([
    [-56, 'setup'],
    [-29, 'setup'],
    [-28, 'pre_release'],
    [-8, 'pre_release'],
    [-7, 'release_week'],
    [0, 'release_week'],
    [7, 'release_week'],
    [8, 'post_release'],
    [22, 'post_release'],
  ])('puts offset %i in %s', (offset, phase) => {
    expect(derivePlanPhase(offset)).toBe(phase);
  });

  // Every authored playbook, not just single: the planner drafts EP and album
  // plans from their own templates, so each one has to split into four
  // non-empty phases or the review scene renders an empty section for it.
  it.each([
    ['single', SINGLE_RELEASE_TEMPLATE],
    ['ep', EP_RELEASE_TEMPLATE],
    ['album', ALBUM_RELEASE_TEMPLATE],
  ])('splits the %s playbook into four phases that add up', (_name, template) => {
    const counts: Record<PlanPhase, number> = {
      setup: 0,
      pre_release: 0,
      release_week: 0,
      post_release: 0,
    };
    for (const task of template.tasks) {
      counts[derivePlanPhase(task.offset_days)] += 1;
    }

    const total =
      counts.setup + counts.pre_release + counts.release_week + counts.post_release;
    expect(total).toBe(template.tasks.length);
    // Every phase must have work in it, or the review scene renders an empty
    // section and the grouping is telling the manager nothing.
    for (const phase of Object.keys(counts) as PlanPhase[]) {
      expect(counts[phase]).toBeGreaterThan(0);
    }
  });
});

describe('date math', () => {
  it('computes a task date from an offset and back again', () => {
    expect(computeTaskYmd('2026-10-02', -56)).toBe('2026-08-07');
    expect(computeTaskYmd('2026-10-02', 0)).toBe('2026-10-02');
    expect(computeTaskYmd('2026-10-02', 22)).toBe('2026-10-24');
    expect(offsetFromTaskYmd('2026-10-02', '2026-08-07')).toBe(-56);
    expect(offsetFromTaskYmd('2026-10-02', '2026-10-24')).toBe(22);
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(computeTaskYmd('2027-01-01', -56)).toBe('2026-11-06');
    expect(offsetFromTaskYmd('2027-01-01', '2026-11-06')).toBe(-56);
  });

  it('returns null rather than a wrong date for unparseable input', () => {
    expect(computeTaskYmd('not-a-date', 0)).toBeNull();
    expect(offsetFromTaskYmd('2026-10-02', 'nope')).toBeNull();
  });
});

describe('suggestReleaseDate', () => {
  const leadDays = getTemplateLeadTimeDays(SINGLE_RELEASE_TEMPLATE);

  it('uses the template lead time when nothing is ready', () => {
    // 2026-08-10 is a Monday. Full 56 days lands on 2026-10-05, a Monday, so
    // the suggestion snaps forward to Friday 2026-10-09.
    expect(suggestReleaseDate('2026-08-10', [], leadDays)).toBe('2026-10-09');
    expect(suggestReleaseDate('2026-08-10', ['none'], leadDays)).toBe('2026-10-09');
  });

  it('shortens the runway as more of the work is already done', () => {
    const nothing = suggestReleaseDate('2026-08-10', [], leadDays) as string;
    const master = suggestReleaseDate('2026-08-10', ['master'], leadDays) as string;
    const masterArt = suggestReleaseDate('2026-08-10', ['master', 'artwork'], leadDays) as string;
    const everything = suggestReleaseDate(
      '2026-08-10',
      ['master', 'artwork', 'distributor'],
      leadDays
    ) as string;

    expect(master < nothing).toBe(true);
    expect(masterArt < master).toBe(true);
    expect(everything < masterArt).toBe(true);
  });

  it('always lands on a Friday', () => {
    for (const ready of [[], ['master'], ['master', 'artwork', 'distributor']] as const) {
      const suggestion = suggestReleaseDate('2026-08-10', [...ready], leadDays) as string;
      expect(new Date(`${suggestion}T00:00:00.000Z`).getUTCDay()).toBe(5);
    }
  });

  it('never suggests less than three weeks of runway', () => {
    const suggestion = suggestReleaseDate(
      '2026-08-10',
      ['master', 'artwork', 'distributor', 'visualizer'],
      28
    ) as string;
    const days =
      (Date.parse(`${suggestion}T00:00:00.000Z`) - Date.parse('2026-08-10T00:00:00.000Z')) /
      86_400_000;
    expect(days).toBeGreaterThanOrEqual(21);
  });

  it('returns null for an unparseable today', () => {
    expect(suggestReleaseDate('10/08/2026', [])).toBeNull();
  });
});

describe('buildDraftFromTemplate', () => {
  it('carries every template task across with the template wording intact', () => {
    const doc = buildBaseDraft();

    expect(doc.tasks).toHaveLength(SINGLE_RELEASE_TEMPLATE.tasks.length);
    expect(doc.template_id).toBe(SINGLE_RELEASE_TEMPLATE.id);
    expect(doc.ai).toEqual({ applied: false, rationale: null, failure: null, warnings: [] });

    const first = SINGLE_RELEASE_TEMPLATE.tasks[0];
    const drafted = doc.tasks[0];
    expect(drafted.id).toBe(first.id);
    expect(drafted.template_task_id).toBe(first.id);
    expect(drafted.why).toBe(first.description);
    expect(drafted.origin).toBe('template');
    expect(drafted.assignee_user_id).toBe(OWNER);
    expect(drafted.removed).toBe(false);
    expect(drafted.edited).toBe(false);
    expect(drafted.removed_reason).toBeNull();
    expect(drafted.change_reason).toBeNull();
    expect(drafted.assignee_basis).toBeNull();
  });

  it('keeps dependency edges pointing at ids that exist in the draft', () => {
    const doc = buildBaseDraft();
    const ids = new Set(doc.tasks.map((task) => task.id));
    for (const task of doc.tasks) {
      for (const dep of task.depends_on) {
        expect(ids.has(dep)).toBe(true);
      }
    }
    expect(doc.tasks.some((task) => task.depends_on.length > 0)).toBe(true);
  });

  it('records the real release type even when the single playbook is the base', () => {
    const doc = buildDraftFromTemplate({
      template: SINGLE_RELEASE_TEMPLATE,
      intake: { ...baseIntake, release_type: 'ep' },
      ownerUserId: OWNER,
      generatedAt: '2026-08-10T09:00:00.000Z',
    });
    expect(doc.release_type).toBe('ep');
    expect(doc.template_id).toBe(SINGLE_RELEASE_TEMPLATE.id);
  });
});

describe('parsePlannerAiDelta', () => {
  it('parses a well-formed delta', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drops: [{ id: 'a', reason: 'No marketing budget for this one.' }],
        adjust_offsets: [{ id: 'b', offset_days: -30.4, reason: 'Distributor is already set up.' }],
        role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
        rewrite_why: [{ id: 'c', why: '  Keep it weekly.  ' }],
        warnings: ['  Release date is close to a holiday.  '],
        rationale: 'Trimmed the paid promo.',
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.drops).toEqual([{ id: 'a', reason: 'No marketing budget for this one.' }]);
    expect(parsed?.adjust_offsets[0].offset_days).toBe(-30);
    expect(parsed?.adjust_offsets[0].reason).toBe('Distributor is already set up.');
    expect(parsed?.rewrite_why[0].why).toBe('Keep it weekly.');
    expect(parsed?.warnings).toEqual(['Release date is close to a holiday.']);
  });

  it('tolerates the legacy drop_task_ids shape, mapping each id to an empty reason', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drop_task_ids: ['a', 'b'],
        adjust_offsets: [],
        role_assignments: [],
        rewrite_why: [],
        rationale: '',
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.drops).toEqual([
      { id: 'a', reason: '' },
      { id: 'b', reason: '' },
    ]);
  });

  it('an absent warnings key parses as an empty list rather than failing', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drops: [],
        adjust_offsets: [],
        role_assignments: [],
        rewrite_why: [],
        rationale: '',
      })
    );
    expect(parsed?.warnings).toEqual([]);
  });

  it('an absent adjust_offsets reason parses as null', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drops: [],
        adjust_offsets: [{ id: 'a', offset_days: 3 }],
        role_assignments: [],
        rewrite_why: [],
        rationale: '',
      })
    );
    expect(parsed?.adjust_offsets[0].reason).toBeNull();
  });

  it('truncates warnings to at most 5 entries of at most 160 characters, dropping blanks', () => {
    const warnings = [...Array(7)].map((_, i) => `Warning number ${i}`);
    warnings.push('   '); // a blank entry, dropped rather than counted
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drops: [],
        adjust_offsets: [],
        role_assignments: [],
        rewrite_why: [],
        warnings: [...warnings, 'x'.repeat(300)],
        rationale: '',
      })
    );
    expect(parsed?.warnings).toHaveLength(5);
    expect(parsed?.warnings.every((w) => w.length <= 160)).toBe(true);
  });

  it.each([
    ['not json at all', 'sorry, here is your plan!'],
    ['a bare array', '[]'],
    ['a missing key', '{"drops":[]}'],
    [
      'a non-string id in the current drops shape',
      '{"drops":[{"id":7,"reason":"x"}],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[]}',
    ],
    [
      'a non-string reason in the current drops shape',
      '{"drops":[{"id":"a","reason":7}],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[]}',
    ],
    [
      'a non-string id in the legacy drop_task_ids shape',
      '{"drop_task_ids":[7],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[]}',
    ],
    [
      'a non-numeric offset',
      '{"drops":[],"adjust_offsets":[{"id":"a","offset_days":"soon"}],"role_assignments":[],"rewrite_why":[]}',
    ],
    [
      'an empty rewrite',
      '{"drops":[],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[{"id":"a","why":"  "}]}',
    ],
    [
      'a non-array warnings',
      '{"drops":[],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[],"warnings":"not an array"}',
    ],
  ])('returns null for %s', (_label, raw) => {
    expect(parsePlannerAiDelta(raw)).toBeNull();
  });

  it('has no way to express an added task', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drops: [],
        adjust_offsets: [],
        role_assignments: [],
        rewrite_why: [],
        warnings: [],
        rationale: '',
        add_tasks: [{ title: 'Invented task' }],
      })
    );
    // The extra key is simply not read: nothing the model invents can reach a
    // draft, which is the whole point of the delta shape.
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed ?? {})).not.toContain('add_tasks');
  });
});

describe('validatePlannerDelta', () => {
  const tasks = [
    { id: 'required_task', optional: false },
    { id: 'optional_task', optional: true },
  ];

  it('accepts a delta that stays inside what it was given', () => {
    const delta: PlannerAiDelta = {
      ...emptyDelta(),
      drops: [{ id: 'optional_task', reason: 'No marketing budget for this one.' }],
      adjust_offsets: [{ id: 'required_task', offset_days: -30, reason: 'Distributor is ready.' }],
      role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
      rewrite_why: [{ id: 'required_task', why: 'Because the master gates everything else.' }],
    };
    expect(validatePlannerDelta(delta, tasks, [OWNER, TEAMMATE]).ok).toBe(true);
  });

  it('accepts adjust_offsets with no reason at all — a reason there is optional', () => {
    const delta = {
      ...emptyDelta(),
      adjust_offsets: [{ id: 'required_task', offset_days: -10, reason: null }],
    };
    expect(validatePlannerDelta(delta, tasks, [OWNER]).ok).toBe(true);
  });

  it('rejects a fabricated task id', () => {
    const delta = {
      ...emptyDelta(),
      drops: [{ id: 'task_that_never_existed', reason: 'Not needed.' }],
    };
    expect(validatePlannerDelta(delta, tasks, [OWNER]).ok).toBe(false);
  });

  it('refuses to drop a required task', () => {
    const delta = { ...emptyDelta(), drops: [{ id: 'required_task', reason: 'Not needed.' }] };
    const result = validatePlannerDelta(delta, tasks, [OWNER]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('required');
  });

  it('refuses a drop with no reason', () => {
    const delta = { ...emptyDelta(), drops: [{ id: 'optional_task', reason: '   ' }] };
    const result = validatePlannerDelta(delta, tasks, [OWNER]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('reason');
  });

  it('refuses a drop reason longer than a manager can read at a glance', () => {
    const delta = { ...emptyDelta(), drops: [{ id: 'optional_task', reason: 'x'.repeat(200) }] };
    expect(validatePlannerDelta(delta, tasks, [OWNER]).ok).toBe(false);
  });

  it('rejects an offset outside the plannable window', () => {
    const delta = { ...emptyDelta(), adjust_offsets: [{ id: 'required_task', offset_days: -400 }] };
    expect(validatePlannerDelta(delta, tasks, [OWNER]).ok).toBe(false);
  });

  it('rejects assigning work to someone who was never offered', () => {
    const delta = {
      ...emptyDelta(),
      role_assignments: [{ role: 'designer' as const, member_user_id: 'someone-else' }],
    };
    expect(validatePlannerDelta(delta, tasks, [OWNER]).ok).toBe(false);
  });

  it('rejects a why line longer than the model is allowed', () => {
    const delta = {
      ...emptyDelta(),
      rewrite_why: [{ id: 'required_task', why: 'x'.repeat(200) }],
    };
    expect(validatePlannerDelta(delta, tasks, [OWNER]).ok).toBe(false);
  });
});

describe('applyDeltaToDraft', () => {
  it('folds drops, offsets, why lines, role assignments and warnings into the draft', () => {
    const doc = buildBaseDraft();
    const optional = doc.tasks.find((task) => task.optional);
    const designerTask = doc.tasks.find((task) => task.role === 'designer');
    expect(optional).toBeDefined();
    expect(designerTask).toBeDefined();

    const next = applyDeltaToDraft(doc, {
      drops: [{ id: optional!.id, reason: 'No budget for paid promo this time.' }],
      adjust_offsets: [
        { id: designerTask!.id, offset_days: -10, reason: 'Distributor confirmed early.' },
      ],
      role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
      rewrite_why: [{ id: designerTask!.id, why: 'Artwork gates the distributor upload.' }],
      warnings: ['Release date lands during a public holiday week.'],
      rationale: 'Tightened the art pass.',
    });

    const droppedAfter = next.tasks.find((task) => task.id === optional!.id);
    expect(droppedAfter?.removed).toBe(true);
    expect(droppedAfter?.removed_by).toBe('ai');
    expect(droppedAfter?.removed_reason).toBe('No budget for paid promo this time.');

    const designerAfter = next.tasks.find((task) => task.id === designerTask!.id);
    expect(designerAfter?.offset_days).toBe(-10);
    expect(designerAfter?.phase).toBe('pre_release');
    expect(designerAfter?.assignee_user_id).toBe(TEAMMATE);
    expect(designerAfter?.assignee_basis).toBe('ai');
    expect(designerAfter?.why).toBe('Artwork gates the distributor upload.');
    expect(designerAfter?.change_reason).toBe('Distributor confirmed early.');

    expect(next.ai).toEqual({
      applied: true,
      rationale: 'Tightened the art pass.',
      failure: null,
      warnings: ['Release date lands during a public holiday week.'],
    });
    // Nothing was created or destroyed: the plan is the same length.
    expect(next.tasks).toHaveLength(doc.tasks.length);
  });

  it('never overwrites a history-based assignee with a model role assignment', () => {
    const doc = buildBaseDraft();
    const designerTask = doc.tasks.find((task) => task.role === 'designer')!;
    const withHistory = {
      ...doc,
      tasks: doc.tasks.map((task) =>
        task.id === designerTask.id
          ? { ...task, assignee_user_id: 'past-designer', assignee_basis: 'history' as const }
          : task
      ),
    };

    const next = applyDeltaToDraft(withHistory, {
      ...emptyDelta(),
      role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
    });

    const after = next.tasks.find((task) => task.id === designerTask.id);
    expect(after?.assignee_user_id).toBe('past-designer');
    expect(after?.assignee_basis).toBe('history');
  });

  it('does not stamp a reason onto a drop that never happened', () => {
    const doc = buildBaseDraft();
    const untouched = doc.tasks[0];
    const next = applyDeltaToDraft(doc, emptyDelta());
    const after = next.tasks.find((task) => task.id === untouched.id);
    expect(after?.removed_reason).toBeNull();
    expect(after?.change_reason).toBeNull();
  });

  it('leaves rows the manager edited alone', () => {
    const doc = buildBaseDraft();
    const target = doc.tasks[0];
    const edited = {
      ...doc,
      tasks: doc.tasks.map((task) =>
        task.id === target.id ? { ...task, edited: true, title: 'My own wording' } : task
      ),
    };

    const next = applyDeltaToDraft(edited, {
      ...emptyDelta(),
      adjust_offsets: [{ id: target.id, offset_days: 3 }],
      rewrite_why: [{ id: target.id, why: 'Model wording.' }],
    });

    const after = next.tasks.find((task) => task.id === target.id);
    expect(after?.title).toBe('My own wording');
    expect(after?.offset_days).toBe(target.offset_days);
  });

  it('only touches the named phase when regenerating one', () => {
    const doc = buildBaseDraft();
    const setupTask = doc.tasks.find((task) => task.phase === 'setup');
    const postTask = doc.tasks.find((task) => task.phase === 'post_release');
    expect(setupTask).toBeDefined();
    expect(postTask).toBeDefined();

    const next = applyDeltaToDraft(
      doc,
      {
        ...emptyDelta(),
        rewrite_why: [
          { id: setupTask!.id, why: 'In scope.' },
          { id: postTask!.id, why: 'Out of scope.' },
        ],
      },
      { phaseScope: 'setup' }
    );

    expect(next.tasks.find((task) => task.id === setupTask!.id)?.why).toBe('In scope.');
    expect(next.tasks.find((task) => task.id === postTask!.id)?.why).toBe(postTask!.why);
  });
});

describe('applyOwnerProposals', () => {
  it('stamps a history proposal onto its task', () => {
    const doc = buildBaseDraft();
    const target = doc.tasks[0];
    const next = applyOwnerProposals(doc, [
      { taskId: target.id, userId: TEAMMATE, basis: 'history', reason: 'Handled it before.' },
    ]);
    const after = next.tasks.find((task) => task.id === target.id);
    expect(after?.assignee_user_id).toBe(TEAMMATE);
    expect(after?.assignee_basis).toBe('history');
  });

  it('stamps a role proposal the same way', () => {
    const doc = buildBaseDraft();
    const target = doc.tasks[0];
    const next = applyOwnerProposals(doc, [
      { taskId: target.id, userId: TEAMMATE, basis: 'role', reason: 'Usually takes this role.' },
    ]);
    expect(next.tasks.find((task) => task.id === target.id)?.assignee_basis).toBe('role');
  });

  it('a creator proposal changes nothing — it is already the template default', () => {
    const doc = buildBaseDraft();
    const target = doc.tasks[0];
    const next = applyOwnerProposals(doc, [
      { taskId: target.id, userId: OWNER, basis: 'creator', reason: 'Nobody has done this before.' },
    ]);
    const after = next.tasks.find((task) => task.id === target.id);
    expect(after?.assignee_user_id).toBe(OWNER);
    expect(after?.assignee_basis).toBeNull();
  });

  it('leaves a task with no matching proposal untouched', () => {
    const doc = buildBaseDraft();
    const next = applyOwnerProposals(doc, []);
    expect(next.tasks).toEqual(doc.tasks);
  });
});

describe('resetPhaseToTemplate', () => {
  it('restores template wording and dates for one phase before a redraft', () => {
    const doc = buildBaseDraft();
    const target = doc.tasks.find((task) => task.phase === 'setup');
    expect(target).toBeDefined();

    const messy = {
      ...doc,
      tasks: doc.tasks.map((task) =>
        task.id === target!.id
          ? { ...task, why: 'A previous redraft.', removed: true, removed_by: 'ai' as const }
          : task
      ),
    };

    const reset = resetPhaseToTemplate(messy, SINGLE_RELEASE_TEMPLATE, 'setup', OWNER);
    const after = reset.tasks.find((task) => task.id === target!.id);
    expect(after?.why).toBe(target!.why);
    expect(after?.removed).toBe(false);
    expect(after?.removed_by).toBeNull();
  });

  it('keeps tasks the manager added', () => {
    const doc = buildBaseDraft();
    const withUserTask = {
      ...doc,
      tasks: [
        ...doc.tasks,
        {
          ...doc.tasks[0],
          id: 'user_abc',
          template_task_id: null,
          origin: 'user' as const,
          title: 'Call the plugger',
          why: 'Mine.',
          phase: 'setup' as const,
          offset_days: -40,
        },
      ],
    };

    const reset = resetPhaseToTemplate(withUserTask, SINGLE_RELEASE_TEMPLATE, 'setup', OWNER);
    const mine = reset.tasks.find((task) => task.id === 'user_abc');
    expect(mine?.title).toBe('Call the plugger');
    expect(mine?.why).toBe('Mine.');
  });
});

describe('deriveScheduleWarnings', () => {
  it('warns when no release date is set, and returns only that warning', () => {
    const doc = buildBaseDraft();
    expect(deriveScheduleWarnings(doc, null, '2026-08-10')).toEqual([
      'No release date is set yet, so these dates are relative to release day only.',
    ]);
  });

  it('returns no warnings when the release is 12 weeks out — comfortably ahead of every task', () => {
    const doc = buildBaseDraft();
    const today = '2026-06-01';
    const releaseDate = formatYmd(
      Date.parse(`${today}T00:00:00.000Z`) + 84 * 24 * 60 * 60 * 1000
    );
    expect(deriveScheduleWarnings(doc, releaseDate, today)).toEqual([]);
  });

  it('counts tasks landing before today, worded in the plural for more than one', () => {
    const doc = buildBaseDraft();
    // The earliest single-template task lands 2026-08-07 (release date minus
    // 56 days, per the date-math test above). A week later than that leaves
    // more than one task behind.
    const warnings = deriveScheduleWarnings(doc, '2026-10-02', '2026-08-14');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\d+ tasks land before today\. They stay in the plan under Catch up\.$/);
  });

  it('says "task lands", singular, for exactly one', () => {
    const doc = buildBaseDraft();
    const onlyOneTask = { ...doc, tasks: [{ ...doc.tasks[0], offset_days: -56 }] };
    expect(deriveScheduleWarnings(onlyOneTask, '2026-10-02', '2026-08-10')).toEqual([
      '1 task lands before today. They stay in the plan under Catch up.',
    ]);
  });

  it('ignores a task that has been dropped', () => {
    const doc = buildBaseDraft();
    const allRemoved = { ...doc, tasks: doc.tasks.map((task) => ({ ...task, removed: true })) };
    expect(deriveScheduleWarnings(allRemoved, '2026-10-02', '2026-08-14')).toEqual([]);
  });

  it('returns no warnings for an unparseable "today"', () => {
    const doc = buildBaseDraft();
    expect(deriveScheduleWarnings(doc, '2026-10-02', 'not-a-date')).toEqual([]);
  });
});

describe('parseDraftDoc', () => {
  const knownTemplateTaskIds = new Set(SINGLE_RELEASE_TEMPLATE.tasks.map((task) => task.id));

  it('accepts a draft it just built', () => {
    const result = parseDraftDoc(buildBaseDraft(), { knownTemplateTaskIds });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.tasks).toHaveLength(SINGLE_RELEASE_TEMPLATE.tasks.length);
  });

  it('recomputes the phase instead of trusting the client', () => {
    const doc = buildBaseDraft();
    const tampered = {
      ...doc,
      tasks: doc.tasks.map((task, index) =>
        index === 0 ? { ...task, offset_days: 30, phase: 'setup' } : task
      ),
    };
    const result = parseDraftDoc(tampered, { knownTemplateTaskIds });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.tasks[0].phase).toBe('post_release');
  });

  it('drops dependency edges that point outside the draft', () => {
    const doc = buildBaseDraft();
    const tampered = {
      ...doc,
      tasks: doc.tasks.map((task, index) =>
        index === 0 ? { ...task, depends_on: ['ghost_task', task.id] } : task
      ),
    };
    const result = parseDraftDoc(tampered, { knownTemplateTaskIds });
    expect(result.ok).toBe(true);
    // The ghost and the self-reference both go: neither could resolve to a
    // real task UUID at approval.
    if (result.ok) expect(result.doc.tasks[0].depends_on).toEqual([]);
  });

  it('rejects a template task claiming a playbook step that does not exist', () => {
    const doc = buildBaseDraft();
    const tampered = {
      ...doc,
      tasks: doc.tasks.map((task, index) =>
        index === 0 ? { ...task, template_task_id: 'invented_step' } : task
      ),
    };
    expect(parseDraftDoc(tampered, { knownTemplateTaskIds }).ok).toBe(false);
  });

  it('accepts a task the manager added', () => {
    const doc = buildBaseDraft();
    const withUserTask = {
      ...doc,
      tasks: [
        ...doc.tasks,
        {
          id: 'user_abc',
          template_task_id: null,
          origin: 'user',
          title: 'Call the plugger',
          why: 'They asked for a heads up.',
          phase: 'setup',
          offset_days: -40,
          duration_days: 1,
          role: null,
          assignee_user_id: OWNER,
          optional: false,
          task_type: 'task',
          tags: [],
          depends_on: [],
          removed: false,
          removed_by: null,
          edited: true,
        },
      ],
    };
    const result = parseDraftDoc(withUserTask, { knownTemplateTaskIds });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.tasks).toHaveLength(doc.tasks.length + 1);
  });

  it.each([
    ['a duplicate id', (doc: ReturnType<typeof buildBaseDraft>) => ({
      ...doc,
      tasks: [...doc.tasks, doc.tasks[0]],
    })],
    ['an empty title', (doc: ReturnType<typeof buildBaseDraft>) => ({
      ...doc,
      tasks: doc.tasks.map((task, i) => (i === 0 ? { ...task, title: '   ' } : task)),
    })],
    ['an offset far outside the window', (doc: ReturnType<typeof buildBaseDraft>) => ({
      ...doc,
      tasks: doc.tasks.map((task, i) => (i === 0 ? { ...task, offset_days: 900 } : task)),
    })],
    ['an older schema version', (doc: ReturnType<typeof buildBaseDraft>) => ({
      ...doc,
      schema_version: 0,
    })],
  ])('rejects %s', (_label, mutate) => {
    expect(parseDraftDoc(mutate(buildBaseDraft()), { knownTemplateTaskIds }).ok).toBe(false);
  });
});

describe('buildPlannerMessages', () => {
  it('states the schema, forbids invention, and embeds only real ids', () => {
    const doc = buildBaseDraft();
    const messages = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: baseIntake,
      tasks: toPromptTasks(doc.tasks.slice(0, 3)),
      members: [{ user_id: OWNER, name: 'Tola', role: 'owner' }],
      todayYmd: '2026-08-10',
    });

    expect(messages).toHaveLength(2);
    const [system, user] = messages;
    expect(system.content).toContain('Output schema:');
    expect(system.content).toContain('You cannot add tasks.');
    expect(system.content).toContain('NEVER drop a task whose "optional" is false');
    expect(user.content).toContain(doc.tasks[0].id);
    expect(user.content).toContain(OWNER);
  });

  it('requires a reason for every drop and never treats a before-today task as one', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: baseIntake,
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
    });
    const [system] = messages;
    expect(system.content).toContain('Every drop needs a "reason"');
    expect(system.content).toContain(
      'A task landing before today is never by itself a reason to drop it or move it.'
    );
    expect(system.content).toContain('"drops"');
    expect(system.content).toContain('"warnings"');
  });

  // The guidance line has to describe the playbook the draft ACTUALLY came
  // from. Telling the model to "stretch the asset work to cover more tracks"
  // when it is already looking at the EP playbook would make it duplicate work
  // that is in front of it; claiming the EP playbook when the flag is off would
  // be a lie about the plan the manager is editing.
  it('tells the model when an EP fell back to the single playbook', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Nights', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: { ...baseIntake, release_type: 'ep' },
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
      fallbackToSingle: true,
    });
    expect(messages[1].content).toContain('EP planned from the single playbook');
  });

  it('does not claim a single-playbook origin when the EP playbook was used', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Nights', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: { ...baseIntake, release_type: 'ep' },
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
      fallbackToSingle: false,
    });
    expect(messages[1].content).not.toContain('from the single playbook');
    expect(messages[1].content).toContain('EP playbook');
    expect(messages[1].content).toContain('lead single drop');
  });

  it('names both staggered singles for an album on its own playbook', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Long Way', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: { ...baseIntake, release_type: 'album' },
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
      fallbackToSingle: false,
    });
    expect(messages[1].content).toContain('album playbook');
    expect(messages[1].content).toContain('staggered single drops');
  });

  it('never adds a format line for a single', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: baseIntake,
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
    });
    expect(messages[1].content).not.toContain('playbook,');
    expect(messages[1].content).not.toContain('from the single playbook');
  });

  it('scopes the prompt when regenerating one phase', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: baseIntake,
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
      phase: 'post_release',
    });
    expect(messages[0].content).toContain('only adjusting the "Post-release" phase');
  });

  it('never names a model or a provider', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: null },
      intake: baseIntake,
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
    });
    const text = messages.map((m) => m.content).join('\n').toLowerCase();
    for (const name of ['claude', 'anthropic', 'openai', 'gpt', 'qwen', 'gemini']) {
      expect(text).not.toContain(name);
    }
  });
});
