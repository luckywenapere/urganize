import { describe, expect, it, vi } from 'vitest';

import { GatewayError } from '../ai/gateway-error';
import { getTemplate } from '../release-templates/loader';
import { shouldSendWalletAlert, isWalletEmptyError } from '../ai/wallet-alert-server';
import {
  DEFAULT_CHANNELS,
  EMPTY_V2_ANSWERS,
  formatNaira,
  parsePlannerV2Answers,
  plannedBudget,
  toLegacyIntake,
  type BudgetBand,
  type PlannerV2Answers,
  type WinGoal,
} from './answers';
import { buildFallbackPlanV2, QUICK_PLAN_NOTICE } from './fallback';
import { buildMoveMenu, NIGERIA_PACK } from './moves';
import { coercePlanV2, parsePlanV2, type PlanV2, type PlanV2Task } from './plan';
import { buildPlanV2Messages } from './prompt';
import { repairPlanV2, validatePlanV2, type PlanV2Context } from './validate';
import { pickPlanV2Model, writePlanV2, PLAN_V2_MODEL, PLAN_V2_TWEAK_MODEL } from './write-plan';
import { planV2ToDoc, resolvePlanV2ReleaseDate } from './server';
import { DRAFT_FIXTURES, type DraftFixture } from './__fixtures__/drafts';
import { parseDraftDoc } from '../release-planning';

// EP and album playbooks sit behind a flag; the single one is always there.
const single = getTemplate('single');

const GOAL_TO_WIN: Record<string, WinGoal> = {
  new_listeners: 'streams',
  playlist_adds: 'playlists',
  press: 'press',
  fan_moment: 'shows',
  catalog: 'streams',
};
const BUDGET_TO_BAND: Record<string, BudgetBand> = {
  none: 'zero',
  under_100k: 'under_100k',
  '100k_500k': '100k_500k',
  over_500k: '500k_2m',
};

/** A real intake, answered the new way. */
function answersFrom(draft: DraftFixture, over: Partial<PlannerV2Answers> = {}): PlannerV2Answers {
  const ready = draft.ready_today;
  return {
    ...EMPTY_V2_ANSWERS,
    release_type: draft.release_type,
    artist_name: 'Test Artist',
    stage: ready.includes('none') ? 'making' : 'finished',
    ready: [
      ...(ready.includes('artwork') ? (['cover_art'] as const) : []),
      ...(ready.includes('visualizer') ? (['video'] as const) : []),
      ...(ready.includes('distributor') ? (['distributor'] as const) : []),
    ],
    release_date: draft.release_date,
    wins: [GOAL_TO_WIN[draft.goal] ?? 'streams'],
    win_text: draft.goal_text,
    budget: BUDGET_TO_BAND[draft.budget] ?? 'zero',
    channels: [...DEFAULT_CHANNELS],
    team: 'solo',
    notes: draft.notes,
    ...over,
  };
}

function ctxFrom(draft: DraftFixture, over: Partial<PlannerV2Answers> = {}): PlanV2Context {
  const answers = answersFrom(draft, over);
  return {
    answers,
    // The fixture's date stands for a rollout that already had one.
    releaseDate: resolvePlanV2ReleaseDate(answers.stage === 'out' ? null : draft.release_date, answers, draft.created)
      .releaseDate,
    todayYmd: draft.created,
  };
}

const task = (over: Partial<PlanV2Task> & { key: string }): PlanV2Task => ({
  library_id: null,
  title: `Task ${over.key}`,
  why: 'Because.',
  done_when: '',
  phase: 'pre_release',
  offset_days: -14,
  duration_days: 1,
  owner_role: 'artist',
  channel: 'none',
  cost_naira: 0,
  depends_on: [],
  first_up: false,
  now: false,
  ...over,
});

/**
 * A plan the way a good model answer looks, for draft d1 (EP, playlist adds,
 * under ₦100k, merch in the notes), 6 weeks out, run by one person.
 */
function goodModelPlan(): PlanV2 {
  const tasks: PlanV2Task[] = [
    task({ key: 't1', title: 'Send the EP to your distributor', channel: 'distribution', offset_days: -42, owner_role: 'distributor_contact', first_up: true }),
    task({ key: 't2', title: 'Pitch Audiomack editorial', channel: 'audiomack', offset_days: -40, library_id: 'ng_audiomack_editorial', depends_on: ['t1'], first_up: true }),
    task({ key: 't3', title: 'Pitch Boomplay editorial', channel: 'boomplay', offset_days: -39, library_id: 'ng_boomplay_editorial', depends_on: ['t1'], first_up: true }),
    task({ key: 't4', title: 'Pitch Spotify editorial', channel: 'spotify', offset_days: -30, depends_on: ['t1'] }),
    task({ key: 't5', title: 'Design the T-shirt and cap', channel: 'merch', offset_days: -28, cost_naira: 40_000 }),
    task({ key: 't6', title: 'Pitch 15 playlist curators', channel: 'spotify', offset_days: -21, cost_naira: 20_000 }),
    task({ key: 't7', title: 'Shoot five short videos of the lead track', channel: 'tiktok', offset_days: -14 }),
    task({ key: 't8', title: 'Set up and share your smart link', offset_days: -7, library_id: 'smart_link', depends_on: ['t7'] }),
    task({ key: 't9', title: 'Release day: share the EP everywhere', phase: 'release', offset_days: 0, library_id: 'release_day' }),
    task({ key: 't10', title: 'Open merch orders with the release', phase: 'release', channel: 'merch', offset_days: 0, cost_naira: 30_000, depends_on: ['t5'] }),
    task({ key: 't11', title: 'Thank every playlist that added you', phase: 'post_release', channel: 'spotify', offset_days: 7 }),
    task({ key: 't12', title: 'Check first-week numbers', phase: 'post_release', offset_days: 8 }),
  ];
  return {
    built_for: {
      summary: 'Playlist adds for the EP in 6 weeks, on ₦90k, run by you.',
      win: 'Playlist adds',
      target: null,
      constraints: ['Merch ready'],
      start_point: 'finished',
    },
    budget: {
      total_naira: 90_000,
      lines: [
        { item: 'Merch run', naira: 70_000, why: 'Shirts and caps' },
        { item: 'Curator pitches', naira: 20_000, why: 'Submission fees' },
      ],
    },
    tasks,
    warnings: [],
    assumptions: [],
  };
}

const d1 = DRAFT_FIXTURES[0];
const d1Ctx = (): PlanV2Context => ({ ...ctxFrom(d1), todayYmd: '2026-08-14' });

describe('answers', () => {
  it('parses a full set of answers and refuses missing ones', () => {
    const answers = answersFrom(d1);
    const parsed = parsePlannerV2Answers(answers);
    expect(parsed.ok).toBe(true);
    expect(parsePlannerV2Answers({ ...answers, channels: [] }).ok).toBe(false);
    expect(parsePlannerV2Answers({ ...answers, wins: [], win_text: '' }).ok).toBe(false);
    expect(parsePlannerV2Answers({ ...answers, stage: 'out', release_date: null, out_when: null }).ok).toBe(false);
    expect(parsePlannerV2Answers({ ...answers, stage: 'out', release_date: null, out_when: 'this_week' }).ok).toBe(true);
  });

  it('plans the exact amount when given, else the band ceiling, and ₦0 for zero', () => {
    expect(plannedBudget({ budget: '100k_500k', budget_exact: 250_000 })).toBe(250_000);
    expect(plannedBudget({ budget: '100k_500k', budget_exact: null })).toBe(500_000);
    expect(plannedBudget({ budget: 'zero', budget_exact: 50_000 })).toBe(0);
    expect(formatNaira(250_000)).toBe('₦250k');
    expect(formatNaira(1_500_000)).toBe('₦1.5m');
  });

  it('maps back to the older intake every reader understands', () => {
    const legacy = toLegacyIntake(answersFrom(d1), '2026-09-25');
    expect(legacy.version).toBe(2);
    expect(legacy.goal).toBe('playlist_adds');
    expect(legacy.ready_today).toContain('artwork');
  });
});

describe('validatePlanV2', () => {
  it('passes a good model plan', () => {
    expect(validatePlanV2(goodModelPlan(), d1Ctx())).toEqual([]);
  });

  const codes = (plan: PlanV2, ctx = d1Ctx()) => validatePlanV2(plan, ctx).map((issue) => issue.code);

  it('refuses spend over the budget', () => {
    const plan = goodModelPlan();
    plan.tasks[4] = { ...plan.tasks[4], cost_naira: 95_000 };
    expect(codes(plan)).toContain('over_budget');
  });

  it('refuses any paid task, or paid words, on a ₦0 budget', () => {
    const ctx = { ...d1Ctx(), answers: { ...d1Ctx().answers, budget: 'zero' as const } };
    const plan = goodModelPlan();
    expect(codes(plan, ctx)).toContain('paid_on_zero');
    plan.tasks = plan.tasks.map((t) => ({ ...t, cost_naira: 0 }));
    plan.tasks[6] = { ...plan.tasks[6], title: 'Run boosted posts on Instagram' };
    expect(codes(plan, ctx)).toContain('paid_words_on_zero');
  });

  it('refuses a channel the manager did not pick', () => {
    const plan = goodModelPlan();
    plan.tasks[6] = { ...plan.tasks[6], channel: 'youtube' };
    expect(codes(plan)).toContain('channel_not_picked');
  });

  it('requires release day and the distributor', () => {
    const plan = goodModelPlan();
    plan.tasks = plan.tasks.filter((t) => t.key !== 't9' && t.key !== 't1');
    plan.tasks = plan.tasks.map((t) => ({ ...t, depends_on: t.depends_on.filter((d) => d !== 't1') }));
    const found = codes(plan);
    expect(found).toContain('missing_release_day');
    expect(found).toContain('missing_distributor');
  });

  it('requires the smart link task before release day (#850)', () => {
    const plan = goodModelPlan();
    plan.tasks = plan.tasks.filter((t) => t.key !== 't8');
    expect(codes(plan)).toContain('missing_smart_link');
  });

  it('counts a pre-save link task the model wrote itself as the smart link task', () => {
    const plan = goodModelPlan();
    plan.tasks = plan.tasks.map((t) => (t.key === 't8' ? { ...t, title: 'Set up the pre-save link', library_id: null } : t));
    expect(codes(plan)).not.toContain('missing_smart_link');
  });

  it('does not ask for a smart link task when there is no day left before release', () => {
    const ctx = { ...d1Ctx(), todayYmd: d1Ctx().releaseDate as string };
    const plan = goodModelPlan();
    plan.tasks = plan.tasks.filter((t) => t.key !== 't8');
    expect(codes(plan, ctx)).not.toContain('missing_smart_link');
  });

  it('does not ask for a smart link task when the song is already out', () => {
    const ctx = { ...d1Ctx(), answers: { ...d1Ctx().answers, stage: 'out' as const } };
    const plan = goodModelPlan();
    plan.tasks = plan.tasks.filter((t) => t.key !== 't8');
    expect(codes(plan, ctx)).not.toContain('missing_smart_link');
  });

  it('refuses dependencies on later or missing tasks, and loops', () => {
    const plan = goodModelPlan();
    plan.tasks[0] = { ...plan.tasks[0], depends_on: ['t9'] };
    plan.tasks[1] = { ...plan.tasks[1], depends_on: ['nope'] };
    const found = codes(plan);
    expect(found).toContain('dependency_order');
    expect(found).toContain('bad_dependency');
    const loop = goodModelPlan();
    loop.tasks[1] = { ...loop.tasks[1], depends_on: ['t3'] };
    loop.tasks[2] = { ...loop.tasks[2], offset_days: -40, depends_on: ['t2'] };
    expect(codes(loop)).toContain('dependency_cycle');
  });

  it('refuses dates before today', () => {
    const ctx = { ...d1Ctx(), todayYmd: '2026-09-01' };
    expect(codes(goodModelPlan(), ctx)).toContain('before_today');
  });

  it('caps tasks per week for one person (about 3)', () => {
    const plan = goodModelPlan();
    plan.tasks = plan.tasks.map((t) => (t.key === 't6' || t.key === 't7' || t.key === 't8' ? { ...t, offset_days: -29, depends_on: [] } : t));
    expect(codes(plan)).toContain('pace');
  });

  it('refuses pre-release work for a song that is already out', () => {
    const ctx = { ...d1Ctx(), answers: { ...d1Ctx().answers, stage: 'out' as const } };
    expect(codes(goodModelPlan(), ctx)).toContain('prerelease_when_out');
  });

  it('refuses budget lines that do not add up', () => {
    const plan = goodModelPlan();
    plan.budget.lines[0] = { ...plan.budget.lines[0], naira: 10_000 };
    expect(codes(plan)).toContain('budget_mismatch');
  });
});

describe('repairPlanV2', () => {
  it('adds the smart link task when the plan has none, two weeks out', () => {
    const ctx = d1Ctx();
    const plan = goodModelPlan();
    plan.tasks = plan.tasks.filter((t) => t.key !== 't8');
    const fixed = repairPlanV2(plan, ctx, buildMoveMenu(single, ctx.answers.channels));
    expect(validatePlanV2(fixed, ctx)).toEqual([]);
    const link = fixed.tasks.filter((t) => t.library_id === 'smart_link');
    expect(link).toHaveLength(1);
    expect(link[0].title).toBe('Set up and share your smart link');
    expect(link[0].offset_days).toBeLessThan(0);
  });

  it('turns a nearly-right answer into a valid plan', () => {
    const ctx = d1Ctx();
    const plan = goodModelPlan();
    plan.tasks[4] = { ...plan.tasks[4], cost_naira: 300_000 }; // over budget
    plan.tasks[6] = { ...plan.tasks[6], channel: 'youtube' }; // not picked
    plan.tasks = plan.tasks.filter((t) => t.key !== 't9'); // no release day
    plan.tasks[0] = { ...plan.tasks[0], depends_on: ['t12'] }; // later dependency
    const fixed = repairPlanV2(plan, ctx, buildMoveMenu(single, ctx.answers.channels));
    expect(validatePlanV2(fixed, ctx)).toEqual([]);
    expect(fixed.tasks.filter((t) => t.first_up)).toHaveLength(3);
  });
});

describe('the quick plan holds for every real intake', () => {
  const variants: Array<[string, Partial<PlannerV2Answers>]> = [
    ['as answered', {}],
    ['₦0, just me', { budget: 'zero', team: 'solo' }],
    ['full team, big budget', { budget: 'over_2m', team: 'full' }],
    ['already out this week', { stage: 'out', out_when: 'this_week', release_date: null }],
    ['already out earlier', { stage: 'out', out_when: 'earlier', release_date: null }],
    ['only Audiomack and radio', { channels: ['audiomack', 'radio'] }],
  ];
  const undatedVariants: Array<[string, Partial<PlannerV2Answers>]> = [
    ['no date yet', {}],
    ['no date, ₦0, full team', { budget: 'zero', team: 'full' }],
  ];
  for (const draft of DRAFT_FIXTURES) {
    for (const [name, over] of undatedVariants) {
      it(`${draft.id}: ${name}`, () => {
        const ctx = { ...ctxFrom(draft, over), releaseDate: null };
        const plan = buildFallbackPlanV2(single, ctx);
        expect(validatePlanV2(plan, ctx)).toEqual([]);
        expect(plan.tasks.some((t) => t.channel === 'distribution')).toBe(true);
        expect(plan.tasks.some((t) => t.now)).toBe(true);
      });
    }
  }
  for (const draft of DRAFT_FIXTURES) {
    for (const [name, over] of variants) {
      it(`${draft.id}: ${name}`, () => {
        const ctx = ctxFrom(draft, over);
        const plan = buildFallbackPlanV2(single, ctx);
        expect(validatePlanV2(plan, ctx)).toEqual([]);
        expect(plan.budget.total_naira).toBe(0);
        expect(plan.warnings).toContain(QUICK_PLAN_NOTICE);
        if (ctx.answers.stage === 'out') expect(plan.tasks.every((t) => t.phase !== 'pre_release')).toBe(true);
      });
    }
  }
});

describe('writePlanV2', () => {
  const base = () => ({
    ctx: d1Ctx(),
    title: 'Midnight',
    template: single,
    mode: { kind: 'generate' as const },
    configured: true,
    model: PLAN_V2_MODEL,
    angleSeed: 1,
  });

  it('uses a valid first answer as is', async () => {
    const call = vi.fn().mockResolvedValue(goodModelPlan());
    const out = await writePlanV2({ ...base(), call });
    expect(out.source).toBe('ai');
    expect(out.notice).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('retries once with only the errors, then uses the fixed answer', async () => {
    const bad = goodModelPlan();
    bad.tasks[4] = { ...bad.tasks[4], cost_naira: 500_000 };
    const call = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(goodModelPlan());
    const out = await writePlanV2({ ...base(), call });
    expect(out.source).toBe('ai');
    expect(call).toHaveBeenCalledTimes(2);
    const retry = call.mock.calls[1][0] as Array<{ content: string }>;
    expect(retry[1].content).toContain('broke these rules');
    expect(retry[1].content).toContain('budget is ₦100000');
  });

  it('lets code repair a second wrong answer before falling back', async () => {
    const bad = goodModelPlan();
    bad.tasks[6] = { ...bad.tasks[6], channel: 'youtube' };
    const call = vi.fn().mockResolvedValue(bad);
    const out = await writePlanV2({ ...base(), call });
    expect(out.source).toBe('ai_repaired');
    expect(validatePlanV2(out.plan, d1Ctx())).toEqual([]);
  });

  it('falls back to the quick plan when the wallet is empty, and raises the alert once', async () => {
    const onWalletEmpty = vi.fn();
    const call = vi.fn().mockRejectedValue(new GatewayError('insufficient_balance', { status: 402 }));
    const out = await writePlanV2({ ...base(), call, onWalletEmpty });
    expect(out.source).toBe('fallback');
    expect(out.fallbackReason).toBe('wallet_empty');
    expect(out.notice).toBe(QUICK_PLAN_NOTICE);
    expect(onWalletEmpty).toHaveBeenCalledTimes(1);
    expect(validatePlanV2(out.plan, d1Ctx())).toEqual([]);
  });

  it('falls back when the model is down or answers nonsense', async () => {
    const down = await writePlanV2({ ...base(), call: vi.fn().mockRejectedValue(new GatewayError('boom', { status: 503 })) });
    expect(down.fallbackReason).toBe('unavailable');
    const nonsense = coercePlanV2({ built_for: {}, budget: {}, tasks: [] }) as PlanV2;
    const junk = await writePlanV2({ ...base(), call: vi.fn().mockResolvedValue(nonsense) });
    expect(['ai_repaired', 'fallback']).toContain(junk.source);
    expect(validatePlanV2(junk.plan, d1Ctx())).toEqual([]);
  });

  it('never calls a model that is not configured', async () => {
    const call = vi.fn();
    const out = await writePlanV2({ ...base(), configured: false, call });
    expect(out.fallbackReason).toBe('not_configured');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('models and prompts', () => {
  it('uses gpt-5.4 for a plan and gpt-5.4-mini for a tweak on RodiumAi', () => {
    expect(pickPlanV2Model('generate', { rodium: true })).toBe(PLAN_V2_MODEL);
    expect(pickPlanV2Model('reroll', { rodium: true })).toBe(PLAN_V2_MODEL);
    expect(pickPlanV2Model('tweak', { rodium: true })).toBe(PLAN_V2_TWEAK_MODEL);
    expect(pickPlanV2Model('generate', { rodium: false })).toBeUndefined();
    expect(pickPlanV2Model('generate', { rodium: true, override: 'x/y' })).toBe('x/y');
  });

  it('puts the answers, the window and the Nigeria pack in the prompt', () => {
    const ctx = d1Ctx();
    const messages = buildPlanV2Messages({
      ctx,
      title: 'Midnight',
      menu: buildMoveMenu(single, ctx.answers.channels),
      mode: { kind: 'tweak', previous: goodModelPlan(), request: 'cheaper, no TikTok' },
    });
    const user = messages[1].content;
    expect(user).toContain('T shirt and cap merch');
    expect(user).toContain('ng_audiomack_editorial');
    expect(user).toContain('cheaper, no TikTok');
  });

  it("puts the artist's saved facts in the prompt, and nothing when there are none", () => {
    const facts = "What the team has decided about this artist (follow it): Playlist pitching: Don't pitch.";
    const ctx = { ...d1Ctx(), artistFacts: facts };
    const menu = buildMoveMenu(single, ctx.answers.channels);
    const mode = { kind: 'generate' } as const;
    expect(buildPlanV2Messages({ ctx, title: 'Midnight', menu, mode })[1].content).toContain(facts);
    expect(buildPlanV2Messages({ ctx: d1Ctx(), title: 'Midnight', menu, mode })[1].content).not.toContain(
      'What the team has decided'
    );
  });

  it('parses fenced JSON and refuses junk', () => {
    expect(parsePlanV2('```json\n' + JSON.stringify(goodModelPlan()) + '\n```')).not.toBeNull();
    expect(parsePlanV2('not json')).toBeNull();
  });

  it('prices every Nigeria pack move and keeps free ones at ₦0', () => {
    for (const move of NIGERIA_PACK) {
      expect(move.naira[0]).toBeLessThanOrEqual(move.naira[1]);
    }
  });
});

describe('saving', () => {
  it('becomes a plan document the existing readers accept', () => {
    const ctx = d1Ctx();
    const doc = planV2ToDoc({
      plan: goodModelPlan(),
      answers: ctx.answers,
      source: 'ai',
      releaseDate: ctx.releaseDate,
      ownerUserId: 'owner-1',
      templateId: single.id,
      templateVersion: single.version,
      generatedAt: '2026-08-14T00:00:00.000Z',
    });
    expect(doc.core_only).toBe(true);
    expect(doc.tasks.every((t) => t.key)).toBe(true);
    expect(doc.tasks.filter((t) => t.focus)).toHaveLength(3);
    expect(doc.tasks.find((t) => t.id === 'v2_t10')?.depends_on).toEqual(['v2_t5']);
    expect(parseDraftDoc(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
  });

  it('dates an already-out song in the past, and keeps a dated rollout', () => {
    expect(resolvePlanV2ReleaseDate(null, { stage: 'out', release_date: null, out_when: 'this_week' }, '2026-10-24').releaseDate).toBe('2026-10-21');
    expect(resolvePlanV2ReleaseDate('2026-11-27', { stage: 'finished', release_date: '2026-12-01', out_when: null }, '2026-10-24').releaseDate).toBe('2026-11-27');
  });

  it('never needs a date for music not out yet (2026-10-26)', () => {
    expect(resolvePlanV2ReleaseDate(null, { stage: 'finished', release_date: null, out_when: null }, '2026-10-24').releaseDate).toBeNull();
    expect(resolvePlanV2ReleaseDate(null, { stage: 'making', release_date: null, out_when: null }, '2026-10-24').releaseDate).toBeNull();
  });
});

describe('the low-balance signal', () => {
  it('knows an empty wallet and emails at most once a day', () => {
    expect(isWalletEmptyError(new GatewayError('x', { status: 402 }))).toBe(true);
    expect(isWalletEmptyError(new GatewayError('x', { status: 503 }))).toBe(false);
    const now = new Date('2026-10-24T12:00:00Z');
    expect(shouldSendWalletAlert(null, now)).toBe(true);
    expect(shouldSendWalletAlert('2026-10-24T01:00:00Z', now)).toBe(false);
    expect(shouldSendWalletAlert('2026-10-23T11:00:00Z', now)).toBe(true);
  });
});
