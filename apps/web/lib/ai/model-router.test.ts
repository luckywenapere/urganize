import { describe, expect, it } from 'vitest';

import { DEFAULT_LADDER, MODEL_TIERS } from './model-ladder';
import {
  classifyChatTurn,
  decisionForTier,
  effectiveRouterMode,
  fitToDeadline,
  legacyModelFor,
  nextAfterFailure,
  readRouterMode,
  resolveCeiling,
  routeModel,
  startUnroutedTrace,
  summarizeTrace,
  type ChatTurnSignals,
  type RouteDecision,
  type RoutingTrace,
} from './model-router';

const turn = (lastUserText: string, userTurns = 1): ChatTurnSignals => ({ lastUserText, userTurns });
const paid = (tier: string) => ({ state: 'paid', tier });

// A request that stacks every cue: analysis (several), multi-step, long input, retry.
const HEAVY = [
  'That is wrong, try again. Why did the last rollout underperform, and what should I change?',
  'Compare it with the two before it, then also prioritize the plan for each channel across the next six weeks.',
  'x'.repeat(600),
].join(' ');

describe('readRouterMode', () => {
  it('is off unless explicitly turned on or to shadow', () => {
    expect(readRouterMode({})).toBe('off');
    expect(readRouterMode({ AI_ROUTER: 'on' })).toBe('on');
    expect(readRouterMode({ AI_ROUTER: ' Shadow ' })).toBe('shadow');
    expect(readRouterMode({ AI_ROUTER: 'ON' })).toBe('on');
  });

  it('does not treat truthy-looking values as on, so a typo cannot switch it on', () => {
    for (const value of ['true', '1', 'yes', 'enabled', '']) {
      expect(readRouterMode({ AI_ROUTER: value })).toBe('off');
    }
  });
});

describe('effectiveRouterMode', () => {
  it('applies to chat only when the chat gateway is RodiumAi (its default)', () => {
    expect(effectiveRouterMode('chat', { AI_ROUTER: 'on' })).toBe('on');
    expect(effectiveRouterMode('chat', { AI_ROUTER: 'on', CHAPPI_API_BASE: 'https://api.rodiumai.io/v1' })).toBe('on');
    expect(effectiveRouterMode('chat', { AI_ROUTER: 'on', CHAPPI_API_BASE: 'https://openrouter.ai/api/v1' })).toBe(
      'off'
    );
  });

  it('applies to the single-shot features only when AI_API_BASE is RodiumAi', () => {
    expect(effectiveRouterMode('status', { AI_ROUTER: 'on', AI_API_BASE: 'https://api.rodiumai.io' })).toBe('on');
    // Unset means the Zuplo gateway, which does not carry these model ids.
    expect(effectiveRouterMode('status', { AI_ROUTER: 'on' })).toBe('off');
    expect(effectiveRouterMode('planner', { AI_ROUTER: 'shadow', AI_API_BASE: 'https://openrouter.ai/api/v1' })).toBe(
      'off'
    );
  });

  it('stays off when the switch is off, whatever the gateway', () => {
    expect(effectiveRouterMode('chat', { AI_ROUTER: 'off' })).toBe('off');
  });
});

describe('legacyModelFor (what each surface used before the router)', () => {
  it('reads each surface\'s own pin, with the fallbacks the old code had', () => {
    expect(legacyModelFor('status', { AI_STATUS_MODEL: 'openai/a' })).toBe('openai/a');
    expect(legacyModelFor('outcome', { AI_OUTCOME_MODEL: 'openai/o', AI_STATUS_MODEL: 'openai/s' })).toBe('openai/o');
    expect(legacyModelFor('outcome', { AI_STATUS_MODEL: 'openai/s' })).toBe('openai/s');
    expect(legacyModelFor('press_kit', { AI_PRESSKIT_MODEL: 'openai/p', AI_STATUS_MODEL: 'openai/s' })).toBe('openai/p');
    expect(legacyModelFor('press_kit', { AI_STATUS_MODEL: 'openai/s' })).toBe('openai/s');
    expect(legacyModelFor('chat', { CHAPPI_MODEL: 'openai/c' })).toBe('openai/c');
  });

  it('is undefined when nothing is set, meaning the gateway\'s own default', () => {
    expect(legacyModelFor('status', {})).toBeUndefined();
    expect(legacyModelFor('chat', {})).toBeUndefined();
    expect(legacyModelFor('status', { AI_STATUS_MODEL: '   ' })).toBeUndefined();
  });

  it('gives the planner its RodiumAi default, and nothing elsewhere', () => {
    expect(legacyModelFor('planner', { AI_API_BASE: 'https://api.rodiumai.io' })).toBe('openai/gpt-5.4');
    expect(legacyModelFor('planner', { AI_API_BASE: 'https://openrouter.ai/api/v1' })).toBeUndefined();
    expect(legacyModelFor('planner', { AI_PLANNER_MODEL: 'openai/gpt-5.4-mini', AI_API_BASE: 'https://api.rodiumai.io' })).toBe(
      'openai/gpt-5.4-mini'
    );
  });
});

describe('resolveCeiling', () => {
  it('caps a paid team by its plan', () => {
    expect(resolveCeiling(paid('solo'), {})).toBe('standard');
    expect(resolveCeiling(paid('manager'), {})).toBe('pro');
    expect(resolveCeiling(paid('label'), {})).toBe('max');
  });

  it('caps a trial at pro, NOT at the top plan its tier claims', () => {
    // resolveTeamTier (lib/entitlements.ts) deliberately reports `label`, which
    // is uncapped, for a trial, so a ceiling read from `tier` alone would hand
    // every three-day trial the most expensive model.
    expect(resolveCeiling({ state: 'trial', tier: 'label' }, {})).toBe('pro');
  });

  it('caps every other unpaid or unknown state at pro as well', () => {
    for (const state of ['grace', 'comped', 'read_only', 'walled', 'something-new', '', null, undefined]) {
      expect(resolveCeiling({ state, tier: 'label' }, {})).toBe('pro');
    }
  });

  it('caps a caller that gave no team information at pro', () => {
    expect(resolveCeiling(undefined, {})).toBe('pro');
  });

  it('is conservative about a paid team whose tier it does not recognise', () => {
    expect(resolveCeiling(paid('enterprise'), {})).toBe('pro');
    expect(resolveCeiling({ state: 'paid', tier: null }, {})).toBe('pro');
  });

  it('can be tuned from the environment, and ignores values that are not tiers', () => {
    expect(resolveCeiling(paid('solo'), { AI_ROUTER_CEILING_SOLO: 'pro' })).toBe('pro');
    expect(resolveCeiling(paid('label'), { AI_ROUTER_CEILING_LABEL: 'standard' })).toBe('standard');
    expect(resolveCeiling({ state: 'trial' }, { AI_ROUTER_CEILING_TRIAL: 'standard' })).toBe('standard');
    expect(resolveCeiling(paid('manager'), { AI_ROUTER_CEILING_MANAGER: 'gold' })).toBe('pro');
  });
});

describe('classifyChatTurn', () => {
  const quickExamples = [
    "what's due this week?",
    'list my releases',
    'show me the timeline for Midnight EP',
    'add a task to book the studio for Friday',
    'mark the artwork task done',
    'open notes',
    'who is assigned to the mastering task',
    '',
    '   ',
  ];

  it.each(quickExamples)('keeps a plain request on the quick rung: %j', (text) => {
    expect(classifyChatTurn(turn(text)).tier).toBe('quick');
  });

  it('keeps a short lookup on quick even when it carries one analysis word', () => {
    // The chip "What should I focus on today?" is the most common request in the
    // app and is answered by reading the dashboard.
    const result = classifyChatTurn(turn('What should I focus on today?'));
    expect(result.tier).toBe('quick');
    expect(result.reasons.join(' ')).toMatch(/simple lookup/i);
  });

  it('moves a single analysis cue up one rung', () => {
    expect(classifyChatTurn(turn('Compare my last two releases')).tier).toBe('standard');
    expect(classifyChatTurn(turn('Prioritize my overdue tasks for this week')).tier).toBe('standard');
  });

  it('moves a long pasted input up one rung', () => {
    expect(classifyChatTurn(turn(`Here is the brief: ${'word '.repeat(150)}`)).tier).toBe('standard');
  });

  it('reads a correction as a reason to try a stronger model, but only after a first answer', () => {
    expect(classifyChatTurn(turn("no that's wrong, do it again", 3)).tier).toBe('standard');
    expect(classifyChatTurn(turn("that's wrong", 1)).tier).toBe('quick');
  });

  it('scores several analysis cues in one message double', () => {
    const result = classifyChatTurn(
      turn(
        'Why did my last release underperform and what should I change next time? Compare it with the one before.'
      )
    );
    expect(result.tier).toBe('pro');
  });

  it('adds multi-step wording on top of analysis', () => {
    const result = classifyChatTurn(
      turn('Draft a launch plan, then also schedule the tasks for each channel across the next six weeks.')
    );
    expect(['pro', 'max']).toContain(result.tier);
    expect(result.reasons.join(' ')).toMatch(/multi-step/i);
  });

  it('counts a numbered list as multi-step', () => {
    const result = classifyChatTurn(turn('Do these:\n1. update the date\n2. tell the team\n3. book the room'));
    expect(result.reasons.join(' ')).toMatch(/multi-step/i);
  });

  it('sends a message that stacks every cue to the top rung', () => {
    expect(classifyChatTurn(turn(HEAVY, 4)).tier).toBe('max');
  });

  it('explains itself', () => {
    const result = classifyChatTurn(turn(HEAVY, 4));
    expect(result.reasons.length).toBeGreaterThan(1);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe('routeModel: UrgAns chat', () => {
  it('sends a plain request to the quick rung on the current model', () => {
    const d = routeModel({ surface: 'chat', chat: turn("what's due this week?"), team: paid('manager'), env: {} });
    expect(d).toMatchObject({ tier: 'quick', model: 'openai/gpt-4o-mini', pinned: false, maxHops: 2, hops: 0 });
    expect(d.models[1]).toBe('openai/gpt-5.6-luna');
  });

  it("keeps today's CHAPPI_MODEL as the quick rung's primary model", () => {
    const d = routeModel({
      surface: 'chat',
      chat: turn('list my releases'),
      team: paid('manager'),
      env: { CHAPPI_MODEL: 'openai/gpt-4.1-mini' },
    });
    expect(d.model).toBe('openai/gpt-4.1-mini');
    expect(d.models[0]).toBe('openai/gpt-4.1-mini');
    expect(new Set(d.models).size).toBe(d.models.length);
  });

  it('lets an explicit AI_LADDER_QUICK win over CHAPPI_MODEL', () => {
    const d = routeModel({
      surface: 'chat',
      chat: turn('list my releases'),
      team: paid('manager'),
      env: { CHAPPI_MODEL: 'openai/gpt-4.1-mini', AI_LADDER_QUICK: 'openai/gpt-5.6-luna' },
    });
    expect(d.model).toBe('openai/gpt-5.6-luna');
  });

  it('routes a strategy question up to pro for a Manager', () => {
    const d = routeModel({
      surface: 'chat',
      chat: turn('Why did my last release underperform and what should I change next time? Compare it with the one before.'),
      team: paid('manager'),
      env: {},
    });
    expect(d).toMatchObject({ tier: 'pro', model: 'openai/gpt-5.6-terra' });
  });

  it('holds a Solo team at standard however hard the request is', () => {
    const d = routeModel({ surface: 'chat', chat: turn(HEAVY, 4), team: paid('solo'), env: {} });
    expect(d.tier).toBe('standard');
    expect(d.ceiling).toBe('standard');
    expect(d.reasons.join(' ')).toMatch(/capped/i);
  });

  it('lets a paid Label team reach the top rung', () => {
    const d = routeModel({ surface: 'chat', chat: turn(HEAVY, 4), team: paid('label'), env: {} });
    expect(d).toMatchObject({ tier: 'max', model: 'openai/gpt-5.6-sol' });
  });

  it('never gives a trial the top rung, even though its tier reads as Label', () => {
    const d = routeModel({ surface: 'chat', chat: turn(HEAVY, 4), team: { state: 'trial', tier: 'label' }, env: {} });
    expect(d.tier).toBe('pro');
    expect(d.ceiling).toBe('pro');
  });

  it('treats a caller with no team as a trial, not as Label', () => {
    const d = routeModel({ surface: 'chat', chat: turn(HEAVY, 4), env: {} });
    expect(d.tier).toBe('pro');
  });

  it('records what today\'s configuration would have used, for shadow comparison', () => {
    const d = routeModel({
      surface: 'chat',
      chat: turn(HEAVY, 4),
      team: paid('label'),
      env: { CHAPPI_MODEL: 'openai/gpt-4o-mini' },
    });
    expect(d.legacyModel).toBe('openai/gpt-4o-mini');
  });
});

describe('routeModel: the other surfaces', () => {
  it('always closes out on the quick rung, however hard the conversation was', () => {
    const d = routeModel({ surface: 'chat_closeout', chat: turn(HEAVY, 4), team: paid('label'), env: {} });
    expect(d.tier).toBe('quick');
  });

  it('holds the planner at pro for every plan: a floor beats a ceiling', () => {
    const solo = routeModel({ surface: 'planner', team: paid('solo'), env: {} });
    expect(solo.tier).toBe('pro');
    expect(solo.model).toBe('openai/gpt-5.6-terra');
    expect(solo.floor).toBe('pro');
    // The ceiling is lifted to the floor rather than left contradicting it.
    expect(solo.ceiling).toBe('pro');
  });

  it('puts status on quick, outcome on quick with no hops, and press-kit drafts on standard', () => {
    expect(routeModel({ surface: 'status', env: {} }).tier).toBe('quick');
    const outcome = routeModel({ surface: 'outcome', env: {} });
    expect(outcome.tier).toBe('quick');
    // The outcome sheet has a 3 second budget; a second attempt cannot fit.
    expect(outcome.maxHops).toBe(0);
    expect(routeModel({ surface: 'press_kit', env: {} }).tier).toBe('standard');
  });

  it('honours an explicit pin and stops routing', () => {
    const d = routeModel({ surface: 'planner', team: paid('label'), env: { AI_PLANNER_MODEL: 'openai/gpt-5.4-mini' } });
    expect(d).toMatchObject({ pinned: true, model: 'openai/gpt-5.4-mini', maxHops: 0 });
    expect(d.models).toEqual(['openai/gpt-5.4-mini']);
  });

  it('lets the outcome and press-kit surfaces fall back to the status pin, as before', () => {
    expect(routeModel({ surface: 'outcome', env: { AI_STATUS_MODEL: 'openai/gpt-5.4-nano' } })).toMatchObject({
      pinned: true,
      model: 'openai/gpt-5.4-nano',
    });
    expect(routeModel({ surface: 'press_kit', env: { AI_PRESSKIT_MODEL: 'openai/gpt-5.4' } })).toMatchObject({
      pinned: true,
      model: 'openai/gpt-5.4',
    });
  });

  it('gives a reasoning effort and token cap from the rung', () => {
    const d = routeModel({ surface: 'planner', env: {} });
    expect(d.reasoningEffort).toBe(DEFAULT_LADDER.pro.reasoningEffort);
    expect(d.maxOutputTokens).toBe(DEFAULT_LADDER.pro.maxOutputTokens);
  });
});

describe('nextAfterFailure', () => {
  const NOW = 1_000_000;
  const at = (tier: (typeof MODEL_TIERS)[number], over: Partial<RouteDecision> = {}): RouteDecision => ({
    ...decisionForTier({ surface: 'chat', tier, ceiling: 'max', env: {} }),
    ...over,
  });
  const next = (decision: RouteDecision, kind: string, extra: { deadlineMs?: number } = {}) =>
    nextAfterFailure({
      decision,
      failure: { kind: kind as never },
      now: NOW,
      env: {},
      ...extra,
    });

  describe('when the model was rate limited or unavailable', () => {
    it('goes to the same-tier sibling first', () => {
      const d = next(at('pro'), 'rate_limited');
      expect(d).toMatchObject({ tier: 'pro', model: 'openai/gpt-5.4', hops: 1 });
      expect(d?.tried).toEqual(['openai/gpt-5.6-terra', 'openai/gpt-5.4']);
    });

    it('goes to the sibling for an unavailable model and a server error too', () => {
      expect(next(at('max'), 'model_unavailable')?.model).toBe('openai/gpt-5.5');
      expect(next(at('standard'), 'server')?.model).toBe('openai/gpt-5.6-luna');
    });

    it('steps down a rung once the siblings are used up', () => {
      const exhausted = at('pro', { tried: ['openai/gpt-5.6-terra', 'openai/gpt-5.4'], hops: 1 });
      const d = next(exhausted, 'rate_limited');
      expect(d).toMatchObject({ tier: 'standard', model: 'openai/gpt-5.4-mini', hops: 2 });
    });

    it('never steps below the surface floor, so a plan is never built on a weaker model', () => {
      const planner = decisionForTier({ surface: 'planner', tier: 'pro', ceiling: 'pro', env: {} });
      const exhausted = { ...planner, tried: ['openai/gpt-5.6-terra', 'openai/gpt-5.4'], hops: 1 };
      expect(next(exhausted, 'rate_limited')).toBeNull();
    });

    it('does not return to a model it already tried', () => {
      const d = next(at('standard', { tried: ['openai/gpt-5.4-mini', 'openai/gpt-5.6-luna'], hops: 1 }), 'server');
      expect(d?.tier).toBe('quick');
      expect(d?.model).toBe('openai/gpt-4o-mini');
    });
  });

  describe('when the model was too slow', () => {
    it('steps DOWN, skipping the sibling, because a same-speed model will not be faster', () => {
      expect(next(at('max'), 'timeout')).toMatchObject({ tier: 'pro', model: 'openai/gpt-5.6-terra' });
    });

    it('falls to the sibling when there is nowhere lower to go', () => {
      expect(next(at('quick'), 'timeout')?.model).toBe('openai/gpt-5.6-luna');
    });
  });

  describe('when the answer was bad', () => {
    it('escalates one rung', () => {
      expect(next(at('quick'), 'bad_output')).toMatchObject({ tier: 'standard', model: 'openai/gpt-5.4-mini', hops: 1 });
      expect(next(at('standard'), 'tool_errors')).toMatchObject({ tier: 'pro', model: 'openai/gpt-5.6-terra' });
    });

    it('stops at the plan ceiling', () => {
      expect(next(at('pro', { ceiling: 'pro' }), 'bad_output')).toBeNull();
      expect(next(at('quick', { ceiling: 'quick' }), 'bad_output')).toBeNull();
    });

    it('stops at the top of the ladder', () => {
      expect(next(at('max'), 'bad_output')).toBeNull();
    });

    it('only escalates when the slower rung can still finish before the deadline', () => {
      // Standard -> pro needs about 12s of model time plus a guard.
      expect(next(at('standard'), 'bad_output', { deadlineMs: NOW + 10_000 })).toBeNull();
      expect(next(at('standard'), 'bad_output', { deadlineMs: NOW + 20_000 })?.tier).toBe('pro');
      // Quick -> standard needs about 6s plus a guard.
      expect(next(at('quick'), 'bad_output', { deadlineMs: NOW + 10_000 })?.tier).toBe('standard');
    });
  });

  describe('when a hop is pointless or forbidden', () => {
    it('does not hop for a failure no other model would fix', () => {
      for (const kind of ['insufficient_balance', 'auth', 'bad_request', 'network', 'unknown']) {
        expect(next(at('pro'), kind)).toBeNull();
      }
    });

    it('stops after the maximum number of hops', () => {
      expect(next(at('pro', { hops: 2 }), 'rate_limited')).toBeNull();
    });

    it('never hops a pinned model', () => {
      const pinned = routeModel({ surface: 'planner', env: { AI_PLANNER_MODEL: 'openai/gpt-5.4' } });
      expect(next(pinned, 'rate_limited')).toBeNull();
    });

    it('never hops the outcome surface: its 3 second budget cannot fit another try', () => {
      expect(next(routeModel({ surface: 'outcome', env: {} }), 'rate_limited')).toBeNull();
    });
  });

  it('keeps a trail of why each hop happened', () => {
    const first = next(at('pro'), 'rate_limited');
    const second = first ? next(first, 'model_unavailable') : null;
    expect(second?.reasons.filter((r) => /hop/i.test(r))).toHaveLength(2);
    expect(second?.hops).toBe(2);
  });
});

describe('fitToDeadline', () => {
  const NOW = 5_000_000;
  const max = decisionForTier({ surface: 'chat', tier: 'max', ceiling: 'max', env: {} });

  it('leaves a decision alone when there is no deadline or plenty of time', () => {
    expect(fitToDeadline(max, { now: NOW, env: {} })).toBe(max);
    expect(fitToDeadline(max, { deadlineMs: NOW + 60_000, now: NOW, env: {} })).toBe(max);
  });

  it('drops to the fastest rung that fits when time is short, without counting a hop', () => {
    const fitted = fitToDeadline(max, { deadlineMs: NOW + 20_000, now: NOW, env: {} });
    expect(fitted?.tier).toBe('pro');
    expect(fitted?.hops).toBe(max.hops);
  });

  it('returns null when nothing fits', () => {
    expect(fitToDeadline(max, { deadlineMs: NOW + 1_000, now: NOW, env: {} })).toBeNull();
  });

  it('will not drop below the surface floor', () => {
    const planner = decisionForTier({ surface: 'planner', tier: 'pro', ceiling: 'pro', env: {} });
    expect(fitToDeadline(planner, { deadlineMs: NOW + 5_000, now: NOW, env: {} })).toBeNull();
  });
});

describe('summarizeTrace', () => {
  const trace: RoutingTrace = {
    mode: 'on',
    surface: 'chat',
    startTier: 'standard',
    endTier: 'pro',
    ceiling: 'pro',
    models: ['openai/gpt-5.4-mini', 'openai/gpt-5.6-terra'],
    hops: [{ from: 'openai/gpt-5.4-mini', to: 'openai/gpt-5.6-terra', kind: 'tool_errors' }],
    reasons: ['analysis cue'],
    rounds: 3,
    tokensIn: 1200,
    tokensOut: 300,
    latencyMs: 4200,
    legacyModel: 'openai/gpt-4o-mini',
  };

  it('flattens a trace into small, storable fields', () => {
    expect(summarizeTrace(trace)).toMatchObject({
      mode: 'on',
      surface: 'chat',
      start_tier: 'standard',
      end_tier: 'pro',
      models: ['openai/gpt-5.4-mini', 'openai/gpt-5.6-terra'],
      hop_count: 1,
      rounds: 3,
      tokens_in: 1200,
      tokens_out: 300,
      latency_ms: 4200,
    });
  });

  it('keeps unknown token counts null instead of turning them into zero', () => {
    const summary = summarizeTrace({ ...trace, tokensIn: null, tokensOut: null });
    expect(summary.tokens_in).toBeNull();
    expect(summary.tokens_out).toBeNull();
  });

  it('bounds its size however long the trace is', () => {
    const big = summarizeTrace({
      ...trace,
      reasons: Array.from({ length: 50 }, () => 'y'.repeat(500)),
      models: Array.from({ length: 50 }, (_, i) => `openai/m${i}`),
      hops: Array.from({ length: 50 }, () => ({ from: 'a/b', to: 'c/d', kind: 'server' })),
    });
    expect(JSON.stringify(big).length).toBeLessThan(2500);
  });

  it('says when a turn was cut short by the clock, and null otherwise', () => {
    expect(summarizeTrace(trace).degraded).toBeNull();
    expect(summarizeTrace({ ...trace, degraded: 'deadline' }).degraded).toBe('deadline');
  });
});

describe('startUnroutedTrace', () => {
  it('describes a request the router did not route, so it can still be logged', () => {
    const trace = startUnroutedTrace('chat', 'openai/gpt-4o-mini');
    expect(trace).toMatchObject({
      mode: 'off',
      surface: 'chat',
      startTier: 'quick',
      endTier: 'quick',
      models: [],
      hops: [],
      reasons: [],
      tokensIn: null,
      tokensOut: null,
      legacyModel: 'openai/gpt-4o-mini',
    });
  });

  it('gives every trace its own arrays, so one request cannot write into another', () => {
    const a = startUnroutedTrace('chat', 'm/a');
    const b = startUnroutedTrace('chat', 'm/a');
    a.models.push('x/y');
    a.hops.push({ from: 'a/b', to: 'c/d', kind: 'server' });
    expect(b.models).toEqual([]);
    expect(b.hops).toEqual([]);
  });
});
