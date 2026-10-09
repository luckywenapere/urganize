import { describe, expect, it } from 'vitest';

import { ALBUM_RELEASE_TEMPLATE } from './release-templates/album';
import { EP_RELEASE_TEMPLATE } from './release-templates/ep';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import { getTemplateLeadTimeDays } from './release-templates/loader';
import {
  applyDeltaToDraft,
  applyOwnerProposals,
  applyPreset,
  applyScopeExclusions,
  buildDraftFromTemplate,
  buildPlannerMessages,
  buildPlanPreview,
  computeTaskYmd,
  derivePlanPhase,
  deriveScheduleWarnings,
  formatYmd,
  isTaskKeptByPreset,
  isTaskPreCompletedByReady,
  offsetFromTaskYmd,
  parseDraftDoc,
  parsePlannerAiDelta,
  parseReleasePlanIntake,
  deriveIntakeExclusions,
  isTaskInScope,
  suggestReleaseDate,
  toPromptTasks,
  validatePlannerDelta,
  KEEP_TAGS,
  PLAN_PRESETS,
  PLAN_SCOPES,
  PLANNER_DELTA_JSON_SCHEMA,
  QUIET_KEEP_TASK_IDS,
  READY_TASK_IDS,
  SCOPE_TAGS,
  type PlannerAiDelta,
  type PlanPhase,
  type PlanScope,
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
  exclude_scopes: [],
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

  it('refuses "unknown" for goal and budget: a plan is only ever built from answered questions', () => {
    expect(parseReleasePlanIntake({ ...baseIntake, goal: 'unknown' }).ok).toBe(false);
    expect(parseReleasePlanIntake({ ...baseIntake, budget: 'unknown' }).ok).toBe(false);
  });

  it('never mentions "unknown" in a validation error, so a Chappi-relayed error cannot teach the model to answer with the word', () => {
    const goalError = parseReleasePlanIntake({ ...baseIntake, goal: 'nonsense' });
    expect(goalError.ok).toBe(false);
    if (!goalError.ok) expect(goalError.error).not.toContain('unknown');

    const budgetError = parseReleasePlanIntake({ ...baseIntake, budget: 'nonsense' });
    expect(budgetError.ok).toBe(false);
    if (!budgetError.ok) expect(budgetError.error).not.toContain('unknown');
  });

  it('reads exclusions, deduplicated and in scope order, and omits the key when there are none', () => {
    const withExclusions = parseReleasePlanIntake({
      ...baseIntake,
      exclusions: ['paid_ads', 'marketing', 'paid_ads'],
    });
    expect(withExclusions.ok).toBe(true);
    if (withExclusions.ok) expect(withExclusions.intake.exclusions).toEqual(['marketing', 'paid_ads']);

    const withoutExclusions = parseReleasePlanIntake({ ...baseIntake, exclusions: [] });
    expect(withoutExclusions.ok).toBe(true);
    if (withoutExclusions.ok) expect(withoutExclusions.intake).not.toHaveProperty('exclusions');
  });

  it('rejects an exclusion it does not know, naming the scopes it does', () => {
    const result = parseReleasePlanIntake({ ...baseIntake, exclusions: ['merch'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('marketing, press, paid_ads, events, physical');

    expect(parseReleasePlanIntake({ ...baseIntake, exclusions: 'marketing' }).ok).toBe(false);
  });
});

// The scope model is what makes "a normal release, no marketing" buildable:
// the delta contract still forbids the model from dropping a required task
// on its own judgement, so removing a whole kind of work is a SCOPE applied
// by code, and release-day and distribution work survive every scope.
describe('scope exclusions', () => {
  const keepTagged = (tags: string[]) =>
    tags.some((tag) => (KEEP_TAGS as readonly string[]).includes(tag));

  it('maps every scope to a tag the playbooks actually use', () => {
    const vocabulary = new Set(
      [SINGLE_RELEASE_TEMPLATE, EP_RELEASE_TEMPLATE, ALBUM_RELEASE_TEMPLATE].flatMap((template) =>
        template.tasks.flatMap((task) => task.tags ?? [])
      )
    );
    for (const scope of PLAN_SCOPES) {
      expect(vocabulary.has(SCOPE_TAGS[scope]), scope).toBe(true);
    }
  });

  it('tags the ads and pressing steps of every playbook, so paid_ads and physical have something to remove', () => {
    for (const template of [SINGLE_RELEASE_TEMPLATE, EP_RELEASE_TEMPLATE, ALBUM_RELEASE_TEMPLATE]) {
      const ads = template.tasks.filter((task) => /_ads$/.test(task.id));
      const physical = template.tasks.filter((task) => /physical_formats$/.test(task.id));
      expect(ads.length, template.id).toBeGreaterThan(0);
      expect(physical.length, template.id).toBeGreaterThan(0);
      for (const task of ads) expect(task.tags, `${template.id}/${task.id}`).toContain('paid');
      for (const task of physical) expect(task.tags, `${template.id}/${task.id}`).toContain('physical');
    }
  });

  it('a task carrying a keep tag is never in scope, whatever else it is tagged', () => {
    expect(isTaskInScope({ tags: ['marketing'] }, 'marketing')).toBe(true);
    expect(isTaskInScope({ tags: ['release_day', 'marketing', 'event'] }, 'marketing')).toBe(false);
    expect(isTaskInScope({ tags: ['release_day', 'marketing', 'event'] }, 'events')).toBe(false);
    expect(isTaskInScope({ tags: ['distribution', 'marketing'] }, 'marketing')).toBe(false);
    expect(isTaskInScope({ tags: ['planning'] }, 'marketing')).toBe(false);
  });

  it('leaving out marketing removes the whole campaign from the single playbook and keeps release-day and distribution work', () => {
    const doc = buildBaseDraft();
    const next = applyScopeExclusions(doc, [
      { scope: 'marketing', by: 'intake', reason: 'You asked to leave out marketing and promo.' },
    ]);

    const removed = next.tasks.filter((task) => task.removed);
    const expectedRemoved = doc.tasks.filter(
      (task) => task.tags.includes('marketing') && !keepTagged(task.tags)
    );
    expect(removed.map((task) => task.id).sort()).toEqual(
      expectedRemoved.map((task) => task.id).sort()
    );
    // This is most of the playbook and it includes required steps, which is
    // the point of the whole change: a delta alone could never do it.
    expect(removed.length).toBeGreaterThan(20);
    expect(removed.some((task) => !task.optional)).toBe(true);

    for (const task of next.tasks) {
      if (keepTagged(task.tags)) expect(task.removed, task.id).toBe(false);
    }
    for (const task of removed) {
      expect(task.removed_by).toBe('intake');
      expect(task.removed_reason).toBe('You asked to leave out marketing and promo.');
    }
    expect(next.applied_exclusions).toEqual([
      { scope: 'marketing', by: 'intake', reason: 'You asked to leave out marketing and promo.' },
    ]);
    // Soft removal only: nothing is created or destroyed.
    expect(next.tasks).toHaveLength(doc.tasks.length);
  });

  it('paid_ads removes exactly the ads steps, and physical exactly the pressing step', () => {
    const doc = buildBaseDraft();
    const ads = applyScopeExclusions(doc, [
      { scope: 'paid_ads', by: 'budget', reason: 'No promo budget.' },
    ]);
    expect(
      ads.tasks
        .filter((task) => task.removed)
        .map((task) => task.id)
        .sort()
    ).toEqual(['post_w2_review_ads', 'w1_final_push_ads']);

    const physical = applyScopeExclusions(doc, [
      { scope: 'physical', by: 'intake', reason: 'You asked to leave out physical formats.' },
    ]);
    expect(physical.tasks.filter((task) => task.removed).map((task) => task.id)).toEqual([
      'w7_physical_formats',
    ]);
  });

  it('events removes the listening party and the events check, never the release-day milestones', () => {
    const next = applyScopeExclusions(buildBaseDraft(), [
      { scope: 'events', by: 'intake', reason: 'You asked to leave out live events.' },
    ]);
    const removedIds = next.tasks
      .filter((task) => task.removed)
      .map((task) => task.id)
      .sort();
    expect(removedIds).toEqual(['w2_listening_party', 'w3_confirm_release_day_events']);
    expect(next.tasks.find((task) => task.id === 'release_day_announcement')?.removed).toBe(false);
  });

  it('applies each scope once: a second entry for the same scope is ignored and never re-stamps a task', () => {
    const doc = buildBaseDraft();
    const first = applyScopeExclusions(doc, [
      { scope: 'paid_ads', by: 'intake', reason: 'You asked to leave out paid ads.' },
    ]);
    const second = applyScopeExclusions(first, [
      { scope: 'paid_ads', by: 'ai', reason: 'Model reason.' },
    ]);
    expect(second.applied_exclusions).toHaveLength(1);
    expect(second.applied_exclusions[0].by).toBe('intake');
    const task = second.tasks.find((t) => t.id === 'w1_final_push_ads');
    expect(task?.removed_by).toBe('intake');
    expect(task?.removed_reason).toBe('You asked to leave out paid ads.');
  });

  it('leaves a task the manager added alone', () => {
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
          tags: ['marketing'],
        },
      ],
    };
    const next = applyScopeExclusions(withUserTask, [
      { scope: 'marketing', by: 'ai', reason: 'They said no marketing.' },
    ]);
    expect(next.tasks.find((task) => task.id === 'user_abc')?.removed).toBe(false);
  });

  it('a scope the module does not know is ignored rather than removing anything', () => {
    const next = applyScopeExclusions(buildBaseDraft(), [
      { scope: 'merch' as PlanScope, by: 'ai', reason: 'x' },
    ]);
    expect(next.tasks.some((task) => task.removed)).toBe(false);
    expect(next.applied_exclusions).toEqual([]);
  });
});

describe('deriveIntakeExclusions', () => {
  it('turns the chips into intake entries with the label in the reason', () => {
    expect(deriveIntakeExclusions({ ...baseIntake, exclusions: ['marketing', 'events'] })).toEqual([
      { scope: 'marketing', by: 'intake', reason: 'You asked to leave out marketing and promo.' },
      { scope: 'events', by: 'intake', reason: 'You asked to leave out live events.' },
    ]);
  });

  it('a budget of none leaves out paid ads on its own', () => {
    expect(deriveIntakeExclusions({ ...baseIntake, budget: 'none' })).toEqual([
      { scope: 'paid_ads', by: 'budget', reason: 'No promo budget.' },
    ]);
  });

  it('the chip wins over the budget when both name paid ads', () => {
    expect(
      deriveIntakeExclusions({ ...baseIntake, budget: 'none', exclusions: ['paid_ads'] })
    ).toEqual([{ scope: 'paid_ads', by: 'intake', reason: 'You asked to leave out paid ads.' }]);
  });

  it('returns nothing for a plain intake', () => {
    expect(deriveIntakeExclusions(baseIntake)).toEqual([]);
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
        exclude_scopes: [{ scope: 'marketing', reason: '  They said no marketing.  ' }],
        drops: [{ id: 'a', reason: 'No marketing budget for this one.' }],
        adjust_offsets: [{ id: 'b', offset_days: -30.4, reason: 'Distributor is already set up.' }],
        role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
        rewrite_why: [{ id: 'c', why: '  Keep it weekly.  ' }],
        warnings: ['  Release date is close to a holiday.  '],
        rationale: 'Trimmed the paid promo.',
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.exclude_scopes).toEqual([{ scope: 'marketing', reason: 'They said no marketing.' }]);
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

  it('an absent exclude_scopes key parses as an empty list, so a model on the older contract still parses', () => {
    const parsed = parsePlannerAiDelta(
      JSON.stringify({
        drops: [],
        adjust_offsets: [],
        role_assignments: [],
        rewrite_why: [],
        rationale: '',
      })
    );
    expect(parsed?.exclude_scopes).toEqual([]);
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
    [
      'a non-string scope',
      '{"exclude_scopes":[{"scope":7,"reason":"x"}],"drops":[],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[]}',
    ],
    [
      'an excluded scope with no reason field',
      '{"exclude_scopes":[{"scope":"marketing"}],"drops":[],"adjust_offsets":[],"role_assignments":[],"rewrite_why":[]}',
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
    { id: 'required_task', optional: false, tags: ['planning'] },
    { id: 'optional_task', optional: true, tags: ['marketing'] },
    { id: 'required_marketing', optional: false, tags: ['marketing'] },
    { id: 'release_day_post', optional: false, tags: ['release_day', 'marketing'] },
  ];
  const validate = (delta: PlannerAiDelta, excludedScopes: PlanScope[] = []) =>
    validatePlannerDelta(delta, { tasks, memberUserIds: [OWNER, TEAMMATE], excludedScopes });

  it('accepts a delta that stays inside what it was given', () => {
    const delta: PlannerAiDelta = {
      ...emptyDelta(),
      drops: [{ id: 'optional_task', reason: 'No marketing budget for this one.' }],
      adjust_offsets: [{ id: 'required_task', offset_days: -30, reason: 'Distributor is ready.' }],
      role_assignments: [{ role: 'designer', member_user_id: TEAMMATE }],
      rewrite_why: [{ id: 'required_task', why: 'Because the master gates everything else.' }],
    };
    expect(validate(delta).ok).toBe(true);
  });

  it('accepts adjust_offsets with no reason at all — a reason there is optional', () => {
    const delta = {
      ...emptyDelta(),
      adjust_offsets: [{ id: 'required_task', offset_days: -10, reason: null }],
    };
    expect(validate(delta).ok).toBe(true);
  });

  it('rejects a fabricated task id', () => {
    const delta = {
      ...emptyDelta(),
      drops: [{ id: 'task_that_never_existed', reason: 'Not needed.' }],
    };
    expect(validate(delta).ok).toBe(false);
  });

  it('refuses to drop a required task the manager did not ask to leave out', () => {
    const delta = { ...emptyDelta(), drops: [{ id: 'required_marketing', reason: 'Not needed.' }] };
    const result = validate(delta);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('required');
      expect(result.error).toContain('asked to leave out');
    }
  });

  it('accepts a required drop inside a scope the manager excluded', () => {
    const delta = {
      ...emptyDelta(),
      drops: [{ id: 'required_marketing', reason: 'No marketing this time.' }],
    };
    expect(validate(delta, ['marketing']).ok).toBe(true);
  });

  it('accepts a required drop inside a scope the model itself excluded', () => {
    const delta: PlannerAiDelta = {
      ...emptyDelta(),
      exclude_scopes: [{ scope: 'marketing', reason: 'They said no marketing.' }],
      drops: [{ id: 'required_marketing', reason: 'Part of the campaign they ruled out.' }],
    };
    expect(validate(delta).ok).toBe(true);
  });

  it('never lets a keep-tagged task go, even inside an excluded scope', () => {
    const delta = { ...emptyDelta(), drops: [{ id: 'release_day_post', reason: 'No marketing.' }] };
    expect(validate(delta, ['marketing']).ok).toBe(false);
  });

  it('refuses a drop with no reason', () => {
    const delta = { ...emptyDelta(), drops: [{ id: 'optional_task', reason: '   ' }] };
    const result = validate(delta);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('reason');
  });

  it('refuses a drop reason longer than a manager can read at a glance', () => {
    const delta = { ...emptyDelta(), drops: [{ id: 'optional_task', reason: 'x'.repeat(200) }] };
    expect(validate(delta).ok).toBe(false);
  });

  it('rejects a scope it does not know', () => {
    const delta = {
      ...emptyDelta(),
      exclude_scopes: [{ scope: 'merch' as PlanScope, reason: 'No merch.' }],
    };
    const result = validate(delta);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('scope');
  });

  it('refuses an excluded scope with no reason, or a reason too long to read', () => {
    const blank = { ...emptyDelta(), exclude_scopes: [{ scope: 'events' as const, reason: '  ' }] };
    expect(validate(blank).ok).toBe(false);
    const long = {
      ...emptyDelta(),
      exclude_scopes: [{ scope: 'events' as const, reason: 'x'.repeat(200) }],
    };
    expect(validate(long).ok).toBe(false);
  });

  it('rejects an offset outside the plannable window', () => {
    const delta = { ...emptyDelta(), adjust_offsets: [{ id: 'required_task', offset_days: -400 }] };
    expect(validate(delta).ok).toBe(false);
  });

  it('rejects assigning work to someone who was never offered', () => {
    const delta = {
      ...emptyDelta(),
      role_assignments: [{ role: 'designer' as const, member_user_id: 'someone-else' }],
    };
    expect(validate(delta).ok).toBe(false);
  });

  it('rejects a why line longer than the model is allowed', () => {
    const delta = {
      ...emptyDelta(),
      rewrite_why: [{ id: 'required_task', why: 'x'.repeat(200) }],
    };
    expect(validate(delta).ok).toBe(false);
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
      exclude_scopes: [],
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

  it('ignores a suggested date for the Spotify pitch and the order it waits on', () => {
    const doc = buildBaseDraft();
    const pitch = doc.tasks.find((task) => task.template_task_id === 'editorial_pitch')!;
    const order = doc.tasks.find((task) => task.template_task_id === 'w6_upload_to_distributor')!;
    const other = doc.tasks.find((task) => task.template_task_id === 'w6_upload_cover_art')!;
    expect(pitch.offset_days).toBe(-28);

    const next = applyDeltaToDraft(doc, {
      ...emptyDelta(),
      adjust_offsets: [
        { id: pitch.id, offset_days: -10, reason: 'Compress the plan.' },
        { id: order.id, offset_days: -10, reason: 'Compress the plan.' },
        { id: other.id, offset_days: -10, reason: 'Compress the plan.' },
      ],
    });

    expect(next.tasks.find((task) => task.id === pitch.id)?.offset_days).toBe(-28);
    expect(next.tasks.find((task) => task.id === order.id)?.offset_days).toBe(order.offset_days);
    // An ordinary step still moves.
    expect(next.tasks.find((task) => task.id === other.id)?.offset_days).toBe(-10);
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

  it("applies an excluded scope as the model's removal, with its reason, before the single drops", () => {
    const doc = buildBaseDraft();
    const next = applyDeltaToDraft(doc, {
      ...emptyDelta(),
      exclude_scopes: [{ scope: 'paid_ads', reason: 'They said no ads.' }],
      rationale: 'No ads.',
    });
    const ads = next.tasks.find((task) => task.id === 'w1_final_push_ads');
    expect(ads?.removed).toBe(true);
    expect(ads?.removed_by).toBe('ai');
    expect(ads?.removed_reason).toBe('They said no ads.');
    expect(next.applied_exclusions).toEqual([
      { scope: 'paid_ads', by: 'ai', reason: 'They said no ads.' },
    ]);
  });

  it('never re-stamps a task the answers already removed', () => {
    const doc = applyScopeExclusions(buildBaseDraft(), [
      { scope: 'paid_ads', by: 'budget', reason: 'No promo budget.' },
    ]);
    const next = applyDeltaToDraft(doc, {
      ...emptyDelta(),
      drops: [{ id: 'w1_final_push_ads', reason: 'Model reason.' }],
    });
    const ads = next.tasks.find((task) => task.id === 'w1_final_push_ads');
    expect(ads?.removed_by).toBe('intake');
    expect(ads?.removed_reason).toBe('No promo budget.');
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

  it('reads a schema 1 plan written before exclusions existed, as version 2 with none applied', () => {
    const { applied_exclusions: _legacyOnly, ...legacy } = { ...buildBaseDraft(), schema_version: 1 };
    const result = parseDraftDoc(legacy, { knownTemplateTaskIds });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schema_version).toBe(2);
      expect(result.doc.applied_exclusions).toEqual([]);
    }
  });

  it('carries applied exclusions and their removals through, dropping an entry it cannot read', () => {
    const doc = applyScopeExclusions(buildBaseDraft(), [
      { scope: 'paid_ads', by: 'budget', reason: 'No promo budget.' },
    ]);
    const tampered = {
      ...doc,
      applied_exclusions: [...doc.applied_exclusions, { scope: 'merch', by: 'ai', reason: 'x' }],
    };
    const result = parseDraftDoc(tampered, { knownTemplateTaskIds });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.applied_exclusions).toEqual([
        { scope: 'paid_ads', by: 'budget', reason: 'No promo budget.' },
      ]);
      expect(result.doc.tasks.find((task) => task.id === 'w1_final_push_ads')?.removed_by).toBe(
        'intake'
      );
    }
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
    // The old absolute rule is gone: a required task may go when, and only
    // when, the manager asked to leave that kind of work out.
    expect(system.content).not.toContain('NEVER drop a task whose "optional" is false');
    expect(system.content).toContain('plainly asked to leave that kind of work out');
    expect(system.content).toContain('"exclude_scopes"');
    expect(system.content).toContain('instructions, not hints');
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
    expect(system.content).toContain('Every drop and every excluded scope needs a "reason"');
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

  // The guidance used to tell EVERY answered intake "No budget: drop the paid
  // promotion tasks", whatever the budget answer was. It is keyed on the real
  // answers now, which is the whole reason the plan can follow them.
  it('keys the budget guidance on the answer instead of assuming no budget', () => {
    const forBudget = (budget: ReleasePlanIntake['budget']) =>
      buildPlannerMessages({
        release: { title: 'Free', artistName: 'Tola', releaseDate: '2026-10-02' },
        intake: { ...baseIntake, budget },
        tasks: [],
        members: [],
        todayYmd: '2026-08-10',
      })[1].content;

    expect(forBudget('none')).toContain('paid ads work is already out of the plan');
    expect(forBudget('none')).toContain('Never suggest paid pushes');
    expect(forBudget('under_100k')).toContain('small budget');
    expect(forBudget('over_500k')).toContain('start the paid work earlier');
    expect(forBudget('over_500k')).not.toContain('already out of the plan');
  });

  it('speaks to what is ready, the goal, and the notes as instructions', () => {
    const user = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: {
        ...baseIntake,
        ready_today: ['master', 'distributor'],
        goal: 'press',
        extra_notes: 'A quiet one, no listening party.',
      },
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
    })[1].content;

    expect(user).toContain('The master is done');
    expect(user).toContain('The distributor is already set up');
    expect(user).toContain('press coverage');
    expect(user).toContain('A quiet one, no listening party.');
    expect(user).toContain('return it in exclude_scopes');
  });

  it('names the scopes already left out and tells the model not to bring them back', () => {
    const user = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: '2026-10-02' },
      intake: { ...baseIntake, exclusions: ['marketing'] },
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
      appliedExclusions: [
        { scope: 'marketing', by: 'intake', reason: 'You asked to leave out marketing and promo.' },
        { scope: 'paid_ads', by: 'budget', reason: 'No promo budget.' },
      ],
    })[1].content;

    expect(user).toContain("Already left out at the manager's request: Marketing and promo, Paid ads.");
    expect(user).toContain('do not suggest bringing them back');
  });

  it('never names a model or a provider', () => {
    const messages = buildPlannerMessages({
      release: { title: 'Free', artistName: 'Tola', releaseDate: null },
      intake: { ...baseIntake, budget: 'none', exclusions: ['events'], extra_notes: 'Keep it small.' },
      tasks: [],
      members: [],
      todayYmd: '2026-08-10',
      appliedExclusions: [{ scope: 'events', by: 'intake', reason: 'You asked to leave out live events.' }],
    });
    const text = messages.map((m) => m.content).join('\n').toLowerCase();
    for (const name of ['claude', 'anthropic', 'openai', 'gpt', 'qwen', 'gemini']) {
      expect(text).not.toContain(name);
    }
  });
});

// The strict schema handed to the gateway's structured-output mode. Strict
// mode refuses a schema with an optional property or an open object, so the
// walker below is what keeps a future field from silently turning the whole
// request into a 400.
describe('PLANNER_DELTA_JSON_SCHEMA', () => {
  type SchemaNode = {
    type?: unknown;
    properties?: Record<string, SchemaNode>;
    items?: SchemaNode;
    required?: string[];
    additionalProperties?: unknown;
    enum?: unknown[];
  };

  const walkObjects = (
    node: SchemaNode,
    path: string,
    visit: (node: SchemaNode, path: string) => void
  ) => {
    if (node.type === 'object') visit(node, path);
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      walkObjects(child, `${path}.${key}`, visit);
    }
    if (node.items) walkObjects(node.items, `${path}[]`, visit);
  };

  it('is strict: every object forbids extra keys and requires every property it declares', () => {
    let objects = 0;
    walkObjects(PLANNER_DELTA_JSON_SCHEMA as SchemaNode, '$', (node, path) => {
      objects += 1;
      expect(node.additionalProperties, path).toBe(false);
      expect([...(node.required ?? [])].sort(), path).toEqual(
        Object.keys(node.properties ?? {}).sort()
      );
    });
    // The root plus the five array item shapes.
    expect(objects).toBe(6);
  });

  it('describes exactly the delta the parser reads', () => {
    expect(Object.keys(PLANNER_DELTA_JSON_SCHEMA.properties).sort()).toEqual(
      Object.keys(emptyDelta()).sort()
    );
    expect(PLANNER_DELTA_JSON_SCHEMA.properties.exclude_scopes.items.properties.scope.enum).toEqual([
      ...PLAN_SCOPES,
    ]);
  });

  it('uses no length or format keywords, which strict mode ignores or rejects: those limits stay in code', () => {
    const text = JSON.stringify(PLANNER_DELTA_JSON_SCHEMA);
    for (const keyword of ['minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'format']) {
      expect(text).not.toContain(`"${keyword}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Presets: quiet and surprise
// ---------------------------------------------------------------------------

const TEMPLATES = [SINGLE_RELEASE_TEMPLATE, EP_RELEASE_TEMPLATE, ALBUM_RELEASE_TEMPLATE];

/** Real template tasks carry an OPTIONAL `tags` (an authoring convenience);
 * every function under test in this section requires it non-optional,
 * matching what the draft-building pipeline normalizes to before these ever
 * see a task in production — see buildPlanPreview's identical normalization. */
const withTags = <T extends { tags?: string[] }>(task: T): T & { tags: string[] } => ({
  ...task,
  tags: task.tags ?? [],
});

describe('isTaskKeptByPreset — surprise (tag-based, every playbook)', () => {
  it('keeps exactly the tasks tagged release_day or distribution, on every playbook', () => {
    for (const template of TEMPLATES) {
      const expected = template.tasks
        .filter((task) => withTags(task).tags.some((tag) => (KEEP_TAGS as readonly string[]).includes(tag)))
        .map((task) => task.id)
        .sort();
      const actual = template.tasks
        .filter((task) => isTaskKeptByPreset(withTags(task), 'surprise', template.id))
        .map((task) => task.id)
        .sort();
      expect(actual, template.id).toEqual(expected);
    }
  });

  it('keeps exactly 14 of the single playbook’s 64 — the reviewed number', () => {
    // 13 until the Spotify editorial pitch joined the distribution steps: it is
    // tagged distribution because Spotify only takes a pitch after delivery, so
    // it is kept like the rest of the delivery chain. Pitching is private to
    // Spotify, not a public announcement.
    const kept = SINGLE_RELEASE_TEMPLATE.tasks.filter((task) =>
      isTaskKeptByPreset(withTags(task), 'surprise', SINGLE_RELEASE_TEMPLATE.id)
    );
    expect(kept).toHaveLength(14);
    expect(kept.some((task) => task.id === 'editorial_pitch')).toBe(true);
  });

  it('never depends on the template id: an unrecognized one gives the same tag-based answer', () => {
    const task = { id: 'w6_upload_to_distributor', tags: ['distribution'] };
    expect(isTaskKeptByPreset(task, 'surprise', 'made_up_template_v9')).toBe(true);
    expect(isTaskKeptByPreset({ id: 'x', tags: ['marketing'] }, 'surprise', 'made_up_template_v9')).toBe(
      false
    );
  });
});

describe('isTaskKeptByPreset / QUIET_KEEP_TASK_IDS — quiet', () => {
  it('references only ids that actually exist in each playbook', () => {
    for (const template of TEMPLATES) {
      const realIds = new Set(template.tasks.map((task) => task.id));
      const keep = QUIET_KEEP_TASK_IDS[template.id];
      expect(keep, template.id).toBeDefined();
      for (const id of keep) {
        expect(realIds.has(id), `${template.id}: ${id}`).toBe(true);
      }
    }
  });

  it('lists no id twice, on any playbook', () => {
    for (const template of TEMPLATES) {
      const keep = QUIET_KEEP_TASK_IDS[template.id];
      expect(new Set(keep).size, template.id).toBe(keep.length);
    }
  });

  it('never leaves out a release-day milestone — a quiet rollout still has a release day', () => {
    for (const template of TEMPLATES) {
      const keep = new Set(QUIET_KEEP_TASK_IDS[template.id]);
      const releaseDayTasks = template.tasks.filter((task) => withTags(task).tags.includes('release_day'));
      expect(releaseDayTasks.length, template.id).toBeGreaterThan(0);
      for (const task of releaseDayTasks) {
        expect(keep.has(task.id), `${template.id}: ${task.id}`).toBe(true);
      }
    }
  });

  it('keeps exactly the reviewed 26 of the single playbook’s 64', () => {
    expect(QUIET_KEEP_TASK_IDS['single_v0.3']).toHaveLength(26);
    const kept = SINGLE_RELEASE_TEMPLATE.tasks.filter((task) =>
      isTaskKeptByPreset(withTags(task), 'quiet', 'single_v0.3')
    );
    expect(kept).toHaveLength(26);
  });

  it('keeps the free Spotify for Artists pitch, which no scope-based rule could', () => {
    // Quiet is a hand-picked allowlist rather than a scope because this free
    // pitch has to survive it.
    expect(QUIET_KEEP_TASK_IDS['single_v0.3']).toContain('editorial_pitch');
    expect(QUIET_KEEP_TASK_IDS['ep_v0.1']).toContain('editorial_pitch');
    expect(QUIET_KEEP_TASK_IDS['album_v0.1']).toContain('editorial_pitch');
  });

  it('never keeps the distributor uploads for a template it does not recognize (fails open, not blind)', () => {
    // Failing OPEN for an unknown template means "keep everything" (act as if
    // no preset were applied), not "guess a shape from another playbook."
    expect(isTaskKeptByPreset({ id: 'anything', tags: [] }, 'quiet', 'made_up_template_v9')).toBe(true);
  });
});

describe('applyPreset', () => {
  it('quiet removes exactly the 38 non-kept tasks of the single playbook, stamped intake', () => {
    const doc = buildBaseDraft();
    const next = applyPreset(doc, 'quiet');
    const removed = next.tasks.filter((task) => task.removed);
    expect(removed).toHaveLength(38);
    for (const task of removed) {
      expect(task.removed_by).toBe('intake');
      expect(task.removed_reason).toBe(
        'Quiet keeps the essentials: the song goes out, with no build-up around it.'
      );
    }
    const kept = next.tasks.filter((task) => !task.removed).map((task) => task.id).sort();
    expect(kept).toEqual([...QUIET_KEEP_TASK_IDS['single_v0.3']].sort());
    // Soft removal only.
    expect(next.tasks).toHaveLength(doc.tasks.length);
  });

  it('surprise removes exactly 50 of the single playbook’s 64', () => {
    const next = applyPreset(buildBaseDraft(), 'surprise');
    expect(next.tasks.filter((task) => task.removed)).toHaveLength(50);
  });

  it('is idempotent: applying it twice removes nothing further', () => {
    const once = applyPreset(buildBaseDraft(), 'quiet');
    const twice = applyPreset(once, 'quiet');
    expect(twice).toEqual(once);
  });

  it('leaves a task the manager added alone, even if it would otherwise be out of scope', () => {
    const doc = buildBaseDraft();
    const withUserTask = {
      ...doc,
      tasks: [
        ...doc.tasks,
        { ...doc.tasks[0], id: 'user_abc', template_task_id: null, origin: 'user' as const },
      ],
    };
    const next = applyPreset(withUserTask, 'quiet');
    expect(next.tasks.find((task) => task.id === 'user_abc')?.removed).toBe(false);
  });
});

describe('parseReleasePlanIntake — preset', () => {
  it('accepts every known preset', () => {
    for (const preset of PLAN_PRESETS) {
      const result = parseReleasePlanIntake({ ...baseIntake, preset });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.intake.preset).toBe(preset);
    }
  });

  it('is absent by default, and rejects an unknown value', () => {
    const withoutPreset = parseReleasePlanIntake(baseIntake);
    expect(withoutPreset.ok && withoutPreset.intake.preset).toBeUndefined();

    const bad = parseReleasePlanIntake({ ...baseIntake, preset: 'chaotic' });
    expect(bad.ok).toBe(false);
  });
});

describe('buildGuidance / describeIntake — preset line reaches the model', () => {
  it('tells the model a preset already restricted the plan, and not to bring anything back', () => {
    const doc = buildBaseDraft();
    const messages = buildPlannerMessages({
      release: { title: 'Ohema', artistName: 'Dorian', releaseDate: '2026-10-02' },
      intake: { ...baseIntake, preset: 'quiet' },
      tasks: toPromptTasks(doc.tasks),
      members: [],
      todayYmd: '2026-08-01',
    });
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Quiet rollout');
    expect(userMessage).toContain('Do not suggest adding marketing, press or paid work back');
  });
});

// ---------------------------------------------------------------------------
// Marking finished work done
// ---------------------------------------------------------------------------

describe('READY_TASK_IDS / isTaskPreCompletedByReady', () => {
  it('references only ids that actually exist in each playbook', () => {
    for (const template of TEMPLATES) {
      const realIds = new Set(template.tasks.map((task) => task.id));
      const map = READY_TASK_IDS[template.id];
      expect(map, template.id).toBeDefined();
      for (const [readyItem, ids] of Object.entries(map)) {
        for (const id of ids ?? []) {
          expect(realIds.has(id), `${template.id}/${readyItem}: ${id}`).toBe(true);
        }
      }
    }
  });

  it('never marks a distributor upload done — the manager still has to do that regardless of what is ready', () => {
    const forbidden = [
      'w6_upload_to_distributor',
      'w6_upload_cover_art',
      'w12_upload_lead_single',
      'w5_upload_ep_to_distributor',
      'w5_upload_ep_art',
      'w15_upload_single_1',
      'w10_upload_single_2',
      'w7_upload_album_to_distributor',
      'w7_upload_album_art',
    ];
    for (const template of TEMPLATES) {
      const map = READY_TASK_IDS[template.id];
      const everyCompletedId = Object.values(map).flat();
      for (const id of forbidden) {
        expect(everyCompletedId, `${template.id}: ${id}`).not.toContain(id);
      }
    }
  });

  it('the single playbook: master completes locking it, artwork completes the brief/draft/approval trio', () => {
    expect(READY_TASK_IDS['single_v0.3'].master).toEqual(['w8_lock_master']);
    expect(READY_TASK_IDS['single_v0.3'].artwork).toEqual([
      'w7_brief_designer',
      'w6_cover_art_first_draft',
      'w5_cover_art_final_approved',
    ]);
  });

  it('completes a task only when a matching ready answer was given', () => {
    const task = { id: 'w8_lock_master' };
    expect(isTaskPreCompletedByReady(task, ['master'], 'single_v0.3')).toBe(true);
    expect(isTaskPreCompletedByReady(task, ['artwork'], 'single_v0.3')).toBe(false);
    expect(isTaskPreCompletedByReady(task, [], 'single_v0.3')).toBe(false);
  });

  it('"none" ready completes nothing', () => {
    const task = { id: 'w8_lock_master' };
    expect(isTaskPreCompletedByReady(task, ['none'], 'single_v0.3')).toBe(false);
  });

  it('fails CLOSED on a template it does not recognize — nothing is marked done', () => {
    expect(isTaskPreCompletedByReady({ id: 'w8_lock_master' }, ['master'], 'made_up_template_v9')).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// The preview UrgAns reads its confirmation from
// ---------------------------------------------------------------------------

describe('buildPlanPreview', () => {
  it('reports the fixed date as given, unsuggested', () => {
    const preview = buildPlanPreview({
      template: SINGLE_RELEASE_TEMPLATE,
      input: { release_date: '2026-10-02', ready_today: [] },
      todayYmd: '2026-08-01',
    });
    expect(preview.releaseDate).toBe('2026-10-02');
    expect(preview.dateWasSuggested).toBe(false);
  });

  it('suggests a date using the TEMPLATE’s own lead time, not a flat constant — EP and album differ from single', () => {
    const today = '2026-08-01';
    const single = buildPlanPreview({
      template: SINGLE_RELEASE_TEMPLATE,
      input: { ready_today: [] },
      todayYmd: today,
    });
    const album = buildPlanPreview({
      template: ALBUM_RELEASE_TEMPLATE,
      input: { ready_today: [] },
      todayYmd: today,
    });
    expect(single.dateWasSuggested).toBe(true);
    expect(album.dateWasSuggested).toBe(true);
    // The album's own runway (119 days) is far longer than the single's (56),
    // so its suggested date must land materially later.
    expect(new Date(album.releaseDate).getTime()).toBeGreaterThan(
      new Date(single.releaseDate).getTime() + 30 * 24 * 60 * 60 * 1000
    );
    // Both suggestions are still Fridays.
    for (const preview of [single, album]) {
      expect(new Date(`${preview.releaseDate}T00:00:00Z`).getUTCDay()).toBe(5);
    }
  });

  it('activityCount for a quiet preset matches the keep-list exactly, on every playbook', () => {
    for (const template of TEMPLATES) {
      const preview = buildPlanPreview({
        template,
        input: { release_date: '2026-12-04', ready_today: [], preset: 'quiet' },
        todayYmd: '2026-08-01',
      });
      expect(preview.activityCount, template.id).toBe(QUIET_KEEP_TASK_IDS[template.id].length);
      expect(preview.totalTemplateTasks, template.id).toBe(template.tasks.length);
    }
  });

  it('activityCount for a surprise preset matches the tag-based count, on every playbook', () => {
    for (const template of TEMPLATES) {
      const expected = template.tasks.filter((task) =>
        withTags(task).tags.some((tag) => (KEEP_TAGS as readonly string[]).includes(tag))
      ).length;
      const preview = buildPlanPreview({
        template,
        input: { release_date: '2026-12-04', ready_today: [], preset: 'surprise' },
        todayYmd: '2026-08-01',
      });
      expect(preview.activityCount, template.id).toBe(expected);
    }
  });

  it('activityCount with no promo budget drops exactly the paid-tagged tasks', () => {
    const withoutBudgetFilter = buildPlanPreview({
      template: SINGLE_RELEASE_TEMPLATE,
      input: { release_date: '2026-12-04', ready_today: [] },
      todayYmd: '2026-08-01',
    });
    const withNoBudget = buildPlanPreview({
      template: SINGLE_RELEASE_TEMPLATE,
      input: { release_date: '2026-12-04', ready_today: [], budget: 'none' },
      todayYmd: '2026-08-01',
    });
    const paidCount = SINGLE_RELEASE_TEMPLATE.tasks.filter((task) => withTags(task).tags.includes('paid')).length;
    expect(paidCount).toBeGreaterThan(0);
    expect(withoutBudgetFilter.activityCount - withNoBudget.activityCount).toBe(paidCount);
  });

  it('counts activities that would already be late if the plan were built today', () => {
    const preview = buildPlanPreview({
      template: SINGLE_RELEASE_TEMPLATE,
      // Release day tomorrow: the whole 8-week pre-release runway is already
      // behind today, so every pre-release task is late.
      input: { release_date: '2026-08-02', ready_today: [] },
      todayYmd: '2026-08-01',
    });
    // "Late" means strictly before today, the same boundary
    // deriveScheduleWarnings uses: release day is 2026-08-02 (offset 0), so a
    // task due exactly today (offset -1) is due ON today, not before it.
    const expectedLate = SINGLE_RELEASE_TEMPLATE.tasks.filter((task) => task.offset_days < -1).length;
    expect(preview.lateCount).toBe(expectedLate);
    expect(preview.lateCount).toBeGreaterThan(0);
  });

  it('reports no staggered single for a single release', () => {
    const preview = buildPlanPreview({
      template: SINGLE_RELEASE_TEMPLATE,
      input: { release_date: '2026-12-04', ready_today: [] },
      todayYmd: '2026-08-01',
    });
    expect(preview.singleDates).toEqual([]);
  });

  it('derives the lead single date for an EP from the template’s own offset, not a hardcoded number', () => {
    const preview = buildPlanPreview({
      template: EP_RELEASE_TEMPLATE,
      input: { release_date: '2026-12-04', ready_today: [] },
      todayYmd: '2026-08-01',
    });
    const milestone = EP_RELEASE_TEMPLATE.tasks.find((task) => task.id === 'w6_lead_single_drop');
    expect(milestone).toBeDefined();
    expect(preview.singleDates).toEqual([
      { label: 'the lead single', date: computeTaskYmd('2026-12-04', milestone!.offset_days) },
    ]);
  });

  it('derives both staggered single dates for an album, in single-1-then-single-2 order', () => {
    const preview = buildPlanPreview({
      template: ALBUM_RELEASE_TEMPLATE,
      input: { release_date: '2027-03-05', ready_today: [] },
      todayYmd: '2026-08-01',
    });
    const single1 = ALBUM_RELEASE_TEMPLATE.tasks.find((task) => task.id === 'w12_single_1_drop');
    const single2 = ALBUM_RELEASE_TEMPLATE.tasks.find((task) => task.id === 'w6_single_2_drop');
    expect(preview.singleDates).toEqual([
      { label: 'single 1', date: computeTaskYmd('2027-03-05', single1!.offset_days) },
      { label: 'single 2', date: computeTaskYmd('2027-03-05', single2!.offset_days) },
    ]);
  });
});
