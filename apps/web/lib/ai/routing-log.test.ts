import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logRoutingTrace, shouldLogTrace } from './routing-log';
import { startUnroutedTrace, type RoutingTrace } from './model-router';

const live = (over: Partial<RoutingTrace> = {}): RoutingTrace => ({
  mode: 'on',
  surface: 'chat',
  startTier: 'quick',
  endTier: 'quick',
  ceiling: 'pro',
  models: ['openai/gpt-4o-mini'],
  hops: [],
  reasons: [],
  tokensIn: 100,
  tokensOut: 20,
  latencyMs: 900,
  ...over,
});

describe('shouldLogTrace', () => {
  it('logs every shadow request, because seeing them is what shadow is for', () => {
    expect(shouldLogTrace(live({ mode: 'shadow' }), false)).toBe(true);
  });

  it('logs a live request that changed model', () => {
    expect(shouldLogTrace(live({ hops: [{ from: 'a/b', to: 'c/d', kind: 'rate_limited' }] }), false)).toBe(true);
  });

  it('logs a live request that failed', () => {
    expect(shouldLogTrace(live(), true)).toBe(true);
  });

  it('logs a turn that was cut short by the clock', () => {
    expect(shouldLogTrace(live({ degraded: 'deadline' }), false)).toBe(true);
  });

  it('stays quiet for a live request that went to its first model and worked', () => {
    expect(shouldLogTrace(live(), false)).toBe(false);
  });

  it('never logs a request the router did not route, even a failed one', () => {
    expect(shouldLogTrace(startUnroutedTrace('chat', 'openai/gpt-4o-mini'), true)).toBe(false);
  });
});

describe('logRoutingTrace', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one tagged JSON line built from the bounded summary', () => {
    logRoutingTrace(live({ mode: 'shadow', wouldUseModel: 'openai/gpt-5.4' }), false);

    expect(console.info).toHaveBeenCalledTimes(1);
    const [tag, line] = (console.info as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(tag).toBe('[ai-router]');
    expect(JSON.parse(line)).toMatchObject({ mode: 'shadow', would_use_model: 'openai/gpt-5.4', tokens_in: 100 });
  });

  it('writes nothing for a quiet request', () => {
    logRoutingTrace(live(), false);
    expect(console.info).not.toHaveBeenCalled();
  });
});
