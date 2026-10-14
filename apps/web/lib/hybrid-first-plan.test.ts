import { describe, expect, it } from 'vitest';

import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import {
  AI_ADD_TASK_TAGS,
  MAX_AI_ADDED_TASKS,
  MAX_DELTA_FOCUS,
  PLANNER_DELTA_JSON_SCHEMA,
  applyDeltaToDraft,
  applyScopeExclusions,
  buildDraftFromTemplate,
  buildPlannerMessages,
  daysUntilRelease,
  deriveIntakeExclusions,
  isDuplicateTaskTitle,
  parseDraftDoc,
  parsePlannerAiDelta,
  sanitizePlannerDelta,
  toPromptTasks,
  validatePlannerDelta,
  type PlannerAiAddTask,
  type PlannerAiDelta,
  type PlannerSanitizeOptions,
  type ReleasePlanIntake,
} from './release-planning';
import { buildTaskRowsFromDraft } from './release-planning-server';
import {
  decidePlanCreationOnAiFailure,
  toPlannerOnboardingContext,
} from './release-planning-actions-server';

// The hybrid first plan (2026-10-11): a deterministic backbone the model can
// only fit, never break. These tests hold the new edges of the delta — adds,
// focus, item-by-item sanitizing — and the inputs the prompt now carries.

const OWNER = '11111111-1111-1111-1111-111111111111';
const TEAMMATE = '22222222-2222-2222-2222-222222222222';

const intake: ReleasePlanIntake = {
  version: 2,
  release_type: 'single',
  artist_name: 'Tola',
  date_mode: 'fixed',
  release_date: '2026-12-04',
  ready_today: ['master'],
  goal: 'new_listeners',
  budget: 'under_100k',
};

const emptyDelta = (): PlannerAiDelta => ({
  exclude_scopes: [],
  drops: [],
  adjust_offsets: [],
  role_assignments: [],
  rewrite_why: [],
  focus: [],
  key: [],
  add_tasks: [],
  warnings: [],
  rationale: '',
});

const add = (overrides: Partial<PlannerAiAddTask> = {}): PlannerAiAddTask => ({
  title: 'Brief two TikTok creators on the hook',
  why: 'New listeners find songs through creators first.',
  offset_days: -20,
  role: 'marketing_lead',
  tags: ['marketing'],
  ...overrides,
});

const tasks = [
  { id: 'plan_meeting', optional: false, tags: ['planning'], title: 'Kick-off meeting with the team', offset_days: -40 },
  { id: 'optional_promo', optional: true, tags: ['marketing'], title: 'Post a studio teaser', offset_days: -14 },
  { id: 'required_promo', optional: false, tags: ['marketing'], title: 'Announce the release date', offset_days: -21 },
  { id: 'release_post', optional: true, tags: ['release_day', 'marketing'], title: 'Release-day post', offset_days: 0 },
  { id: 'distro_upload', optional: false, tags: ['distribution'], title: 'Upload to the distributor', offset_days: -28 },
];

const options = (overrides: Partial<PlannerSanitizeOptions> = {}): PlannerSanitizeOptions => ({
  tasks,
  memberUserIds: [OWNER, TEAMMATE],
  excludedScopes: [],
  budget: 'under_100k',
  todayOffset: -50,
  window: { min: -56, max: 28 },
  ...overrides,
});

describe('sanitizePlannerDelta: one bad item no longer costs the whole delta', () => {
  it('keeps every valid item and refuses only the invalid ones', () => {
    const { delta, rejected } = sanitizePlannerDelta(
      {
        ...emptyDelta(),
        drops: [
          { id: 'optional_promo', reason: 'Not needed for a quiet single.' },
          { id: 'invented_id', reason: 'Made up.' },
        ],
        rewrite_why: [
          { id: 'plan_meeting', why: 'Get the team aligned on reaching new listeners.' },
          { id: 'ghost', why: 'Nope.' },
        ],
        role_assignments: [
          { role: 'designer', member_user_id: TEAMMATE },
          { role: 'manager', member_user_id: 'not-on-team' },
        ],
      },
      options()
    );
    expect(delta.drops.map((d) => d.id)).toEqual(['optional_promo']);
    expect(delta.rewrite_why.map((r) => r.id)).toEqual(['plan_meeting']);
    expect(delta.role_assignments).toEqual([{ role: 'designer', member_user_id: TEAMMATE }]);
    expect(rejected).toHaveLength(3);
  });

  it('never drops a protected task: a required one outside a left-out scope, or any release-day/distribution task', () => {
    const { delta, rejected } = sanitizePlannerDelta(
      {
        ...emptyDelta(),
        drops: [
          { id: 'required_promo', reason: 'Trying to drop required work.' },
          { id: 'release_post', reason: 'Optional, but release day.' },
          { id: 'distro_upload', reason: 'Distribution.' },
        ],
      },
      options()
    );
    expect(delta.drops).toEqual([]);
    expect(rejected).toHaveLength(3);
    expect(rejected.join('\n')).toMatch(/never removed/);
  });

  it('still lets a required task go inside a scope the manager left out', () => {
    const { delta } = sanitizePlannerDelta(
      { ...emptyDelta(), drops: [{ id: 'required_promo', reason: 'No marketing, as asked.' }] },
      options({ excludedScopes: ['marketing'] })
    );
    expect(delta.drops.map((d) => d.id)).toEqual(['required_promo']);
  });

  it('refuses a date move that pushes work still ahead of today into the past', () => {
    const { delta, rejected } = sanitizePlannerDelta(
      {
        ...emptyDelta(),
        adjust_offsets: [
          { id: 'required_promo', offset_days: -60, reason: 'Earlier.' },
          { id: 'optional_promo', offset_days: -30, reason: 'Pulled earlier.' },
        ],
      },
      options({ todayOffset: -50 })
    );
    expect(delta.adjust_offsets.map((a) => a.id)).toEqual(['optional_promo']);
    expect(rejected[0]).toMatch(/into the past/);
  });

  it('keeps validatePlannerDelta as the yes/no form: ok only with nothing refused', () => {
    expect(validatePlannerDelta(emptyDelta(), options()).ok).toBe(true);
    const result = validatePlannerDelta(
      { ...emptyDelta(), drops: [{ id: 'invented_id', reason: 'x' }] },
      options()
    );
    expect(result).toEqual({ ok: false, error: 'drops references unknown task: invented_id' });
  });
});

describe('sanitizePlannerDelta: focus marks', () => {
  it('keeps at most five, on real tasks it does not also drop', () => {
    const focus = [
      { id: 'plan_meeting', reason: 'Aligns everyone.' },
      { id: 'ghost', reason: 'Not real.' },
      { id: 'optional_promo', reason: 'Also dropped.' },
      { id: 'required_promo', reason: 'Date announcement.' },
      { id: 'release_post', reason: 'Release day.' },
      { id: 'distro_upload', reason: 'Gets it to stores.' },
      { id: 'plan_meeting', reason: 'Duplicate.' },
    ];
    const { delta } = sanitizePlannerDelta(
      { ...emptyDelta(), focus, drops: [{ id: 'optional_promo', reason: 'Not needed.' }] },
      options()
    );
    expect(delta.focus.map((f) => f.id)).toEqual(['plan_meeting', 'required_promo', 'release_post', 'distro_upload']);
    expect(delta.focus.length).toBeLessThanOrEqual(MAX_DELTA_FOCUS);
  });
});

describe('sanitizePlannerDelta: added tasks', () => {
  const sanitizeAdds = (adds: PlannerAiAddTask[], overrides: Partial<PlannerSanitizeOptions> = {}) =>
    sanitizePlannerDelta({ ...emptyDelta(), add_tasks: adds }, options(overrides));

  it('accepts a well-formed add', () => {
    const { delta, rejected } = sanitizeAdds([add()]);
    expect(rejected).toEqual([]);
    expect(delta.add_tasks).toHaveLength(1);
  });

  it('refuses each invalid add on its own and keeps the good one', () => {
    const { delta, rejected } = sanitizeAdds([
      add({ title: 'x' }), // too short
      add({ title: 'A'.repeat(81) }), // too long
      add({ why: 'w'.repeat(161) }), // why too long
      add({ why: '' }), // no why
      add({ offset_days: -80 }), // outside the plan window
      add({ offset_days: 40 }), // outside the plan window
      add({ offset_days: -55 }), // inside the window but before today (-50)
      add({ role: 'ceo' as never }), // not a planner role
      add({ tags: [] }), // no tags
      add({ tags: ['release_day'] }), // keep tag: never on an add
      add({ tags: ['made_up'] }), // outside the vocabulary
      add({ title: 'Kick-off meeting with the team!' }), // duplicate of a playbook task
      add({ title: 'Pitch three Lagos radio DJs', tags: ['editorial'], role: 'manager' }), // good
    ]);
    expect(delta.add_tasks.map((t) => t.title)).toEqual(['Pitch three Lagos radio DJs']);
    expect(rejected).toHaveLength(12);
  });

  it('respects excluded scopes, the no-budget rule and presets', () => {
    expect(sanitizeAdds([add()], { excludedScopes: ['marketing'] }).delta.add_tasks).toEqual([]);
    expect(sanitizeAdds([add({ tags: ['paid'] })], { budget: 'none' }).delta.add_tasks).toEqual([]);
    expect(
      sanitizeAdds([add({ title: 'Boost the teaser on Instagram', tags: ['marketing'] })], { budget: 'none' })
        .delta.add_tasks
    ).toEqual([]);
    expect(sanitizeAdds([add({ tags: ['paid'] })], { budget: 'over_500k' }).delta.add_tasks).toHaveLength(1);
    expect(sanitizeAdds([add()], { preset: 'quiet' }).delta.add_tasks).toEqual([]);
  });

  it('keeps at most five adds and refuses duplicates among the adds themselves', () => {
    const titles = [
      'Brief two TikTok creators',
      'Brief two TikTok creators again',
      'Host a fan listening call',
      'Pitch three Lagos radio DJs',
      'Send a thank-you note to early fans',
      'Clip five lyric videos for Reels',
      'Book a campus activation in Abuja',
    ];
    const { delta } = sanitizeAdds(titles.map((title) => add({ title })));
    expect(delta.add_tasks.length).toBe(MAX_AI_ADDED_TASKS);
    expect(delta.add_tasks.map((t) => t.title)).not.toContain('Brief two TikTok creators again');
  });

  it('detects near-duplicate titles', () => {
    expect(isDuplicateTaskTitle('Pitch to Spotify editorial', ['Pitch to Spotify Editorial!'])).toBe(true);
    expect(isDuplicateTaskTitle('Upload the distributor', ['Upload to the distributor'])).toBe(true);
    expect(isDuplicateTaskTitle('Host a fan listening call', ['Upload to the distributor'])).toBe(false);
  });
});

describe('applyDeltaToDraft: adds and focus land on the plan', () => {
  const base = () =>
    buildDraftFromTemplate({
      template: SINGLE_RELEASE_TEMPLATE,
      intake,
      ownerUserId: OWNER,
      generatedAt: '2026-10-11T09:00:00.000Z',
    });

  it('appends added tasks as origin ai, optional, dated by offset, owned by the owner or the assigned role', () => {
    const doc = base();
    const focusId = doc.tasks.find((task) => !task.optional)!.id;
    const next = applyDeltaToDraft(
      doc,
      {
        ...emptyDelta(),
        role_assignments: [{ role: 'marketing_lead', member_user_id: TEAMMATE }],
        focus: [{ id: focusId, reason: 'This is the spine of discovery.' }],
        add_tasks: [add(), add({ title: 'Host a fan listening call', role: null, tags: ['event'], offset_days: 10 })],
      },
      { ownerUserId: OWNER, rejectedItems: 2 }
    );
    const added = next.tasks.filter((task) => task.origin === 'ai');
    expect(added.map((task) => task.id)).toEqual(['ai_1', 'ai_2']);
    expect(added[0]).toMatchObject({
      template_task_id: null,
      optional: true,
      phase: 'pre_release',
      assignee_user_id: TEAMMATE,
      assignee_basis: 'ai',
    });
    expect(added[1]).toMatchObject({ phase: 'post_release', assignee_user_id: OWNER, assignee_basis: null });
    expect(next.tasks.find((task) => task.id === focusId)).toMatchObject({
      focus: true,
      focus_reason: 'This is the spine of discovery.',
    });
    expect(next.ai.rejected_items).toBe(2);
    expect(next.tasks.length).toBe(doc.tasks.length + 2);
  });

  it('round-trips through parseDraftDoc (origin ai, focus) and lands as rows: focus high, ai marked', () => {
    const doc = base();
    const focusId = doc.tasks.find((task) => !task.optional)!.id;
    const next = applyDeltaToDraft(
      doc,
      { ...emptyDelta(), focus: [{ id: focusId, reason: 'Spine.' }], add_tasks: [add()] },
      { ownerUserId: OWNER }
    );
    const parsed = parseDraftDoc(JSON.parse(JSON.stringify(next)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.tasks.find((task) => task.id === 'ai_1')?.origin).toBe('ai');
    expect(parsed.doc.tasks.find((task) => task.id === focusId)?.focus).toBe(true);

    const { rows } = buildTaskRowsFromDraft({
      doc: parsed.doc,
      draftId: 'draft-1',
      releaseId: 'release-1',
      releaseDate: '2026-12-04',
      workspaceId: 'ws-1',
      ownerUserId: OWNER,
      assignableUserIds: new Set([OWNER, TEAMMATE]),
      approvedAtMs: Date.parse('2026-10-11T09:00:00.000Z'),
    });
    const aiRow = rows.find((row) => row.title === add().title)!;
    expect((aiRow.metadata.planner as Record<string, unknown>).origin).toBe('ai');
    expect(aiRow.status).toBe('todo');
    const focusRow = rows.find((row) => (row.metadata.planner as Record<string, unknown>).draft_task_id === focusId)!;
    expect(focusRow.priority).toBe('high');
    expect(rows.filter((row) => row.priority === 'high')).toHaveLength(1);
  });

  it('leaves the backbone alone where it must: readiness pre-completion still applies to template tasks', () => {
    const doc = base();
    const next = applyDeltaToDraft(doc, { ...emptyDelta(), add_tasks: [add()] }, { ownerUserId: OWNER });
    const { rows } = buildTaskRowsFromDraft({
      doc: next,
      draftId: 'd',
      releaseId: 'r',
      releaseDate: '2026-12-04',
      workspaceId: 'w',
      ownerUserId: OWNER,
      assignableUserIds: new Set([OWNER]),
      approvedAtMs: Date.parse('2026-10-11T09:00:00.000Z'),
    });
    // ready_today: ['master'] pre-completes the playbook's lock-master step.
    expect(rows.some((row) => row.status === 'done')).toBe(true);
  });

  it('a scope the manager excluded stays excluded after the delta: no added task inside it can pass the gate', () => {
    const excludedIntake: ReleasePlanIntake = { ...intake, exclusions: ['marketing'] };
    const doc = applyScopeExclusions(
      buildDraftFromTemplate({ template: SINGLE_RELEASE_TEMPLATE, intake: excludedIntake, ownerUserId: OWNER, generatedAt: 'x' }),
      deriveIntakeExclusions(excludedIntake)
    );
    const { delta } = sanitizePlannerDelta(
      { ...emptyDelta(), add_tasks: [add()] },
      options({ excludedScopes: doc.applied_exclusions.map((entry) => entry.scope) })
    );
    expect(applyDeltaToDraft(doc, delta).tasks.some((task) => task.origin === 'ai')).toBe(false);
  });
});

describe('parsePlannerAiDelta: focus and add_tasks', () => {
  it('parses both, rounding offsets and skipping malformed entries', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        ...emptyDelta(),
        focus: [{ id: ' a ', reason: ' Matters. ' }, { reason: 'no id' }],
        add_tasks: [
          { title: '  Pitch   DJs ', why: ' Radio still moves Lagos. ', offset_days: -10.6, role: 'manager', tags: ['editorial'] },
          { title: 'No date', why: 'x' },
        ],
      })
    );
    expect(parsed?.focus).toEqual([{ id: 'a', reason: 'Matters.' }]);
    expect(parsed?.add_tasks).toEqual([
      { title: 'Pitch DJs', why: 'Radio still moves Lagos.', offset_days: -11, role: 'manager', tags: ['editorial'] },
    ]);
  });

  it('reads an older response with neither key as empty', () => {
    const { focus, add_tasks, ...older } = emptyDelta();
    void focus;
    void add_tasks;
    const parsed = parsePlannerAiDelta(JSON.stringify(older));
    expect(parsed?.focus).toEqual([]);
    expect(parsed?.add_tasks).toEqual([]);
  });

  it('the strict schema declares both, with the tag vocabulary as an enum', () => {
    const props = PLANNER_DELTA_JSON_SCHEMA.properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['focus', 'add_tasks']));
    expect(props.add_tasks.items.properties.tags.items.enum).toEqual([...AI_ADD_TASK_TAGS]);
    expect(AI_ADD_TASK_TAGS).not.toContain('release_day');
    expect(AI_ADD_TASK_TAGS).not.toContain('distribution');
  });
});

describe('the prompt carries every selection, including onboarding', () => {
  const messages = () =>
    buildPlannerMessages({
      release: { title: 'Love Me JeJe', artistName: 'Tola', releaseDate: '2026-12-04' },
      intake: {
        ...intake,
        goal_text: 'Get on Lagos radio',
        exclusions: ['physical'],
        extra_notes: 'We have a small street team.',
      },
      tasks: toPromptTasks(
        buildDraftFromTemplate({ template: SINGLE_RELEASE_TEMPLATE, intake, ownerUserId: OWNER, generatedAt: 'x' }).tasks
      ),
      members: [{ user_id: OWNER, name: 'Oyin', role: 'owner' }],
      todayYmd: '2026-10-11',
      onboarding: {
        painPoints: ['Keeping the team aligned', 'Marketing and promo'],
        planningPreference: 'Give me AI recommendations',
      },
    });

  it('includes type, title, artist, date and days out, what is done, goal, budget, coverage and notes', () => {
    const user = messages()[1].content;
    expect(user).toContain('- Format: Single');
    expect(user).toContain('- Title: Love Me JeJe');
    expect(user).toContain('- Artist: Tola');
    expect(user).toContain('2026-12-04 (54 days from today)');
    expect(user).toContain('- Already done: The music is mixed and mastered');
    expect(user).toContain('- What matters most: Reach new listeners');
    expect(user).toContain('- Promo budget: Under ₦100k');
    expect(user).toContain('- The plan should cover: Marketing');
    expect(user).not.toMatch(/should cover:[^\n]*Physical/);
    expect(user).toContain('Get on Lagos radio');
    expect(user).toContain('We have a small street team.');
  });

  it('includes the onboarding pain points and planning preference', () => {
    const user = messages()[1].content;
    expect(user).toContain('Where their rollouts usually fall apart: Keeping the team aligned; Marketing and promo');
    expect(user).toContain('How they like to plan: Give me AI recommendations');
  });

  it('asks for focus and bounded adds, and sends the task list compact', () => {
    const [system, user] = messages();
    expect(system.content).toContain('"add_tasks"');
    expect(system.content).toContain('"focus"');
    expect(user.content).not.toContain('\n  {');
    expect(user.content).toMatch(/The plan runs from offset -\d+ to \d+/);
  });

  it('leaves the onboarding block out when there is nothing to say', () => {
    const user = buildPlannerMessages({
      release: { title: 'T', artistName: 'A', releaseDate: null },
      intake,
      tasks: [],
      members: [],
      todayYmd: '2026-10-11',
    })[1].content;
    expect(user).not.toContain('About this manager');
  });

  it('counts days out from today', () => {
    expect(daysUntilRelease('2026-12-04', '2026-10-11')).toBe(54);
    expect(daysUntilRelease(null, '2026-10-11')).toBeNull();
  });
});

describe('onboarding answers become prompt context', () => {
  it('maps profile columns to labels and drops unknown values', () => {
    expect(
      toPlannerOnboardingContext({
        onboarding_where_stuck: ['marketing_promo', 'nonsense', 'distribution'],
        onboarding_planning_preference: 'ai_recommendations',
      })
    ).toEqual({
      painPoints: ['Marketing and promo', 'Distribution and platforms'],
      planningPreference: 'Give me AI recommendations',
    });
    expect(toPlannerOnboardingContext({ onboarding_where_stuck: null, onboarding_planning_preference: 'x' })).toBeNull();
  });
});

describe('a first plan is never refused over a model failure', () => {
  it('proceeds with a plain warning even when notes were typed', () => {
    const decision = decidePlanCreationOnAiFailure('timeout', { extra_notes: 'No press.' }, { firstPlan: true });
    expect(decision.action).toBe('proceed');
    expect(decision.action === 'proceed' && decision.warning).toMatch(/could not read your notes/);
  });

  it('a later plan with typed notes is still refused, as before', () => {
    expect(decidePlanCreationOnAiFailure('timeout', { extra_notes: 'No press.' }).action).toBe('refuse');
  });
});
