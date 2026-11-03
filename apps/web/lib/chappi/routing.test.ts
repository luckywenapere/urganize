import { describe, expect, it } from 'vitest';

import { GatewayError } from '@/lib/ai/gateway-error';
import {
  AGENT_ALERT_LOG_LINES,
  chatSignals,
  completeShadowTrace,
  describeAgentError,
  planChatRouting,
  planCloseoutRouting,
  routingMetadata,
  TURN_BUDGET_MS,
} from './routing';
import { startTrace, startUnroutedTrace, routeModel } from '@/lib/ai/model-router';
import { DEFAULT_LADDER } from '@/lib/ai/model-ladder';
import type { ChappiMessage } from './types';

const msg = (role: 'user' | 'assistant', content: string, id = Math.random().toString(36)): ChappiMessage => ({
  id,
  role,
  content,
});

const ON = { AI_ROUTER: 'on' };
const paid = (tier: string) => ({ state: 'paid', tier });

// One request that stacks every cue the classifier reads.
const HEAVY = [
  'That is wrong, try again. Why did the last rollout underperform, and what should I change?',
  'Compare it with the two before it, then also prioritize the plan for each channel across the next six weeks.',
  'x'.repeat(600),
].join(' ');

describe('chatSignals', () => {
  it('reads the latest user message and counts the user turns', () => {
    const signals = chatSignals([msg('user', 'first'), msg('assistant', 'reply'), msg('user', 'second')]);
    expect(signals).toEqual({ lastUserText: 'second', userTurns: 2 });
  });

  it('ignores assistant turns when finding the last thing the user said', () => {
    expect(chatSignals([msg('user', 'question'), msg('assistant', 'a long answer')]).lastUserText).toBe('question');
  });

  it('handles an empty conversation', () => {
    expect(chatSignals([])).toEqual({ lastUserText: '', userTurns: 0 });
  });
});

describe('planChatRouting', () => {
  const messages = [msg('user', 'what is due this week?')];

  it('does nothing while the router is off, which is the default', () => {
    expect(planChatRouting({ messages, team: paid('label'), env: {} })).toEqual({ mode: 'off' });
  });

  it('does nothing on a gateway that does not carry the ladder, whatever AI_ROUTER says', () => {
    const env = { ...ON, CHAPPI_API_BASE: 'https://openrouter.ai/api/v1' };
    expect(planChatRouting({ messages, team: paid('label'), env })).toEqual({ mode: 'off' });
  });

  it('gives a live plan: the turn\'s rung, a cheap closing rung, and a deadline', () => {
    const plan = planChatRouting({ messages, team: paid('label'), env: ON, now: () => 1_000_000 });

    expect(plan.mode).toBe('on');
    if (plan.mode !== 'on') return;
    expect(plan.routing.decision).toMatchObject({ surface: 'chat', tier: 'quick' });
    expect(plan.routing.closeoutDecision).toMatchObject({ surface: 'chat_closeout', tier: 'quick' });
    expect(plan.routing.deadlineMs).toBe(1_000_000 + TURN_BUDGET_MS);
  });

  it('reads the conversation: a heavy ask lands on a higher rung than a lookup', () => {
    const heavy = planChatRouting({ messages: [msg('user', HEAVY)], team: paid('label'), env: ON });
    const light = planChatRouting({ messages, team: paid('label'), env: ON });
    if (heavy.mode !== 'on' || light.mode !== 'on') throw new Error('expected live plans');
    expect(heavy.routing.decision.tier).toBe('max');
    expect(light.routing.decision.tier).toBe('quick');
  });

  it('holds a paying team to its plan: Solo tops out at standard', () => {
    const plan = planChatRouting({ messages: [msg('user', HEAVY)], team: paid('solo'), env: ON });
    if (plan.mode !== 'on') throw new Error('expected a live plan');
    expect(plan.routing.decision.tier).toBe('standard');
    expect(plan.routing.decision.ceiling).toBe('standard');
  });

  it('does not hand a trial team the flagship: a trial resolves to label, but is held at pro', () => {
    const plan = planChatRouting({ messages: [msg('user', HEAVY)], team: { state: 'trial', tier: 'label' }, env: ON });
    if (plan.mode !== 'on') throw new Error('expected a live plan');
    expect(plan.routing.decision.tier).toBe('pro');
  });

  it('holds an unknown team, and a missing one, at pro as well', () => {
    for (const team of [undefined, {}, { state: null, tier: null }]) {
      const plan = planChatRouting({ messages: [msg('user', HEAVY)], team, env: ON });
      if (plan.mode !== 'on') throw new Error('expected a live plan');
      expect(plan.routing.decision.tier).toBe('pro');
    }
  });

  it('carries the env it decided under, so a hop reads the same ladder', () => {
    const env = { ...ON, AI_LADDER_QUICK: 'openai/gpt-5.6-luna' };
    const plan = planChatRouting({ messages, team: paid('label'), env });
    if (plan.mode !== 'on') throw new Error('expected a live plan');
    expect(plan.routing.decision.model).toBe('openai/gpt-5.6-luna');
    expect(plan.routing.env).toBe(env);
  });

  it('in shadow, decides and records but hands back no routing, so today\'s model still answers', () => {
    const plan = planChatRouting({ messages: [msg('user', HEAVY)], team: paid('label'), env: { AI_ROUTER: 'shadow' } });

    expect(plan.mode).toBe('shadow');
    if (plan.mode !== 'shadow') return;
    expect('routing' in plan).toBe(false);
    expect(plan.trace.mode).toBe('shadow');
    expect(plan.trace.wouldUseModel).toBe('openai/gpt-6.1-sol');
    expect(plan.trace.startTier).toBe('max');
  });
});

describe('planChatRouting and streaming', () => {
  const env = { AI_ROUTER: 'on', CHAPPI_API_BASE: 'https://api.rodiumai.io/v1' };
  const messages: ChappiMessage[] = [{ id: 'm1', role: 'user', content: 'hello' }];
  const team = { state: 'paid', tier: 'manager' } as never;

  it('plans the streaming cap for a streamed turn', () => {
    const plan = planChatRouting({ messages, team, streaming: true, env });
    expect(plan.mode).toBe('on');
    if (plan.mode !== 'on') return;
    expect(plan.routing.decision.streaming).toBe(true);
    expect(plan.routing.decision.maxOutputTokens).toBe(DEFAULT_LADDER.quick.streamMaxOutputTokens);
  });

  it('plans the plain cap otherwise', () => {
    const plan = planChatRouting({ messages, team, env });
    if (plan.mode !== 'on') throw new Error('expected a live plan');
    expect(plan.routing.decision.maxOutputTokens).toBe(DEFAULT_LADDER.quick.maxOutputTokens);
    expect(plan.routing.decision.streaming).toBeUndefined();
  });

  it('does not raise the cap of the closing line, which is never streamed', () => {
    const plan = planChatRouting({ messages, team, streaming: true, env });
    if (plan.mode !== 'on') throw new Error('expected a live plan');
    expect(plan.routing.closeoutDecision?.streaming).toBeUndefined();
  });
});

describe('completeShadowTrace', () => {
  it('adds what actually happened to what the router would have done', () => {
    const decision = routeModel({ surface: 'chat', chat: { lastUserText: HEAVY, userTurns: 1 }, team: paid('label'), env: {} });
    const shadow = startTrace(decision, 'shadow');
    shadow.wouldUseModel = decision.model;

    const actual = startUnroutedTrace('chat', 'openai/gpt-4o-mini');
    actual.models = ['openai/gpt-4o-mini'];
    actual.tokensIn = 900;
    actual.tokensOut = 40;
    actual.latencyMs = 2100;
    actual.rounds = 2;

    const done = completeShadowTrace(shadow, actual);

    expect(done).toMatchObject({
      mode: 'shadow',
      startTier: 'max',
      wouldUseModel: 'openai/gpt-6.1-sol',
      models: ['openai/gpt-4o-mini'],
      tokensIn: 900,
      tokensOut: 40,
      latencyMs: 2100,
      rounds: 2,
    });
  });

  it('does not touch the trace it was given', () => {
    const decision = routeModel({ surface: 'chat', chat: { lastUserText: 'hi', userTurns: 1 }, env: {} });
    const shadow = startTrace(decision, 'shadow');
    completeShadowTrace(shadow, { ...startUnroutedTrace('chat', 'm/a'), models: ['m/a'], tokensIn: 5 });
    expect(shadow.models).toEqual([]);
    expect(shadow.tokensIn).toBeNull();
  });
});

describe('routingMetadata', () => {
  it('is nothing at all when the router is off, so the row is exactly what it was', () => {
    expect(routingMetadata(startUnroutedTrace('chat', 'openai/gpt-4o-mini'))).toBeUndefined();
  });

  it('is the bounded summary, under one key, for a live or shadow turn', () => {
    const decision = routeModel({ surface: 'chat', chat: { lastUserText: 'hi', userTurns: 1 }, env: {} });
    for (const mode of ['on', 'shadow'] as const) {
      const meta = routingMetadata(startTrace(decision, mode));
      expect(Object.keys(meta ?? {})).toEqual(['routing']);
      expect(meta?.routing).toMatchObject({ mode, surface: 'chat', start_tier: 'quick' });
    }
  });
});

describe('planCloseoutRouting', () => {
  it('is nothing unless the router is live, because shadow never changes a model', () => {
    expect(planCloseoutRouting({ env: {} })).toBeUndefined();
    expect(planCloseoutRouting({ env: { AI_ROUTER: 'shadow' } })).toBeUndefined();
  });

  it('is the cheap closing rung when live', () => {
    const plan = planCloseoutRouting({ env: ON });
    expect(plan?.decision).toMatchObject({ surface: 'chat_closeout', tier: 'quick' });
  });
});

describe('describeAgentError', () => {
  const gateway = (status: number, code?: string) =>
    new GatewayError(`Chappi gateway request failed (${status}): x`, { status, code });

  it('tells the user a slow model was too slow', () => {
    const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    expect(describeAgentError(abort)).toMatchObject({ status: 504, message: 'AI took too long. Try again.' });
    expect(describeAgentError(gateway(504))).toMatchObject({ status: 504 });
  });

  it('recognises the gateway\'s own rate limit code, which the old message match missed', () => {
    // The gateway says `rate_limit_exceeded`, with an underscore. The pattern the
    // route used, /rate[- ]limit/, does not match that.
    expect(describeAgentError(gateway(429, 'rate_limit_exceeded'))).toMatchObject({
      status: 503,
      message: 'AI is busy. Try again in a moment.',
    });
    expect(describeAgentError(new Error('rate_limit_exceeded'))).toMatchObject({ status: 503 });
  });

  it('keeps the generic unavailable message for everything else, and marks it worth a log line', () => {
    for (const error of [gateway(500), new Error('boom'), gateway(400), 'a string']) {
      expect(describeAgentError(error)).toMatchObject({
        status: 503,
        message: 'AI is unavailable right now.',
        alert: 'unexpected',
      });
    }
  });

  it('flags the failures that need a human, without telling the user why', () => {
    expect(describeAgentError(gateway(402, 'insufficient_balance'))).toMatchObject({
      status: 503,
      message: 'AI is unavailable right now.',
      alert: 'balance',
    });
    expect(describeAgentError(gateway(401))).toMatchObject({
      status: 503,
      message: 'AI is unavailable right now.',
      alert: 'credentials',
    });
  });

  it('logs nothing for the ordinary failures: a slow model, a busy gateway', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(describeAgentError(abort).alert).toBeUndefined();
    expect(describeAgentError(gateway(429, 'rate_limit_exceeded')).alert).toBeUndefined();
  });

  it('has a log line for every kind of alert', () => {
    expect(Object.keys(AGENT_ALERT_LOG_LINES).sort()).toEqual(['balance', 'credentials', 'unexpected']);
    for (const line of Object.values(AGENT_ALERT_LOG_LINES)) expect(line).toMatch(/^\[chappi\]/);
  });
});
