import { describe, expect, it } from 'vitest';

import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import { getTemplateLeadTimeDays } from './release-templates/loader';
import {
  applyDeltaToDraft,
  buildDraftFromTemplate,
  buildPlannerMessages,
  computeTaskYmd,
  derivePlanPhase,
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
  drop_task_ids: [],
  adjust_offsets: [],
  role_assignments: [],
  rewrite_why: [],
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

  it('splits the single playbook into four phases that add up', () => {
    const counts: Record<PlanPhase, number> = {
      setup: 0,
      pre_release: 0,
      release_week: 0,
      post_release: 0,
    };
    for (const task of SINGLE_RELEASE_TEMPLATE.tasks) {
      counts[derivePlanPhase(task.offset_days)] += 1;
    }

    const total =
      counts.setup + counts.pre_release + counts.release_week + counts.post_release;
    expect(total).toBe(SINGLE_RELEASE_TEMPLATE.tasks.length);
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
    expect(doc.ai).toEqual({ applied: false, rationale: null, failure: null });

    const first = SINGLE_RELEASE_TEMPLATE.tasks[0];
    const drafted = doc.tasks[0];
    expect(drafted.id).toBe(first.id);
    expect(drafted.template_task_id).toBe(first.id);
    expect(drafted.why).toBe(first.description);
    expect(drafted.origin).toBe('template');
    expect(drafted.assignee_user_id).toBe(OWNER);
    expect(drafted.removed).toBe(false);
    expect(drafted.edited).toBe(false);
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
        drop_task_ids: ['a'],
        adjust_offsets: [{ id: 'b', offset_days: -30.4 }],
        role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
        rewrite_why: [{ id: 'c', why: '  Keep it weekly.  ' }],
        rationale: 'Trimmed the paid promo.',
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.adjust_offsets[0].offset_days).toBe(-30);
    expect(parsed?.rewrite_why[0].why).toBe('Keep it weekly.');
  });

  it.each([
    ['not json at all', 'sorry, here is your plan!'],
    ['a bare array', '[]'],
    ['a missing key', '{"drop_task_ids":[]}'],
    ['a non-string id', '{"drop_task_ids":[7],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[]}'],
    [
      'a non-numeric offset',
      '{"drop_task_ids":[],"adjust_offsets":[{"id":"a","offset_days":"soon"}],"role_assignments":[],"rewrite_why":[]}',
    ],
    [
      'an empty rewrite',
      '{"drop_task_ids":[],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[{"id":"a","why":"  "}]}',
    ],
  ])('returns null for %s', (_label, raw) => {
    expect(parsePlannerAiDelta(raw)).toBeNull();
  });

  it('has no way to express an added task', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drop_task_ids: [],
        adjust_offsets: [],
        role_assignments: [],
        rewrite_why: [],
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
      drop_task_ids: ['optional_task'],
      adjust_offsets: [{ id: 'required_task', offset_days: -30 }],
      role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
      rewrite_why: [{ id: 'required_task', why: 'Because the master gates everything else.' }],
    };
    expect(validatePlannerDelta(delta, tasks, [OWNER, TEAMMATE]).ok).toBe(true);
  });

  it('rejects a fabricated task id', () => {
    const delta = { ...emptyDelta(), drop_task_ids: ['task_that_never_existed'] };
    expect(validatePlannerDelta(delta, tasks, [OWNER]).ok).toBe(false);
  });

  it('refuses to drop a required task', () => {
    const delta = { ...emptyDelta(), drop_task_ids: ['required_task'] };
    const result = validatePlannerDelta(delta, tasks, [OWNER]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('required');
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
  it('folds drops, offsets, why lines and role assignments into the draft', () => {
    const doc = buildBaseDraft();
    const optional = doc.tasks.find((task) => task.optional);
    const designerTask = doc.tasks.find((task) => task.role === 'designer');
    expect(optional).toBeDefined();
    expect(designerTask).toBeDefined();

    const next = applyDeltaToDraft(doc, {
      drop_task_ids: [optional!.id],
      adjust_offsets: [{ id: designerTask!.id, offset_days: -10 }],
      role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
      rewrite_why: [{ id: designerTask!.id, why: 'Artwork gates the distributor upload.' }],
      rationale: 'Tightened the art pass.',
    });

    const droppedAfter = next.tasks.find((task) => task.id === optional!.id);
    expect(droppedAfter?.removed).toBe(true);
    expect(droppedAfter?.removed_by).toBe('ai');

    const designerAfter = next.tasks.find((task) => task.id === designerTask!.id);
    expect(designerAfter?.offset_days).toBe(-10);
    expect(designerAfter?.phase).toBe('pre_release');
    expect(designerAfter?.assignee_user_id).toBe(TEAMMATE);
    expect(designerAfter?.why).toBe('Artwork gates the distributor upload.');

    expect(next.ai).toEqual({
      applied: true,
      rationale: 'Tightened the art pass.',
      failure: null,
    });
    // Nothing was created or destroyed: the plan is the same length.
    expect(next.tasks).toHaveLength(doc.tasks.length);
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

  it('tells the model when an EP is being planned from the single playbook', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Nights', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: { ...baseIntake, release_type: 'ep' },
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
    });
    expect(messages[1].content).toContain('EP planned from the single playbook');
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
