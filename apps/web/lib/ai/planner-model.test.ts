import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolvePlannerModel, resolvePlannerReasoningEffort } from './planner-model';

// Both read the environment at call time, so no module reset is needed
// between cases; each one stubs exactly what it depends on.
describe('resolvePlannerModel', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('an explicit AI_PLANNER_MODEL wins on any gateway', () => {
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
    vi.stubEnv('AI_PLANNER_MODEL', ' openai/gpt-5.4-mini ');
    expect(resolvePlannerModel()).toBe('openai/gpt-5.4-mini');
  });

  it('defaults to the strong OpenAI model on RodiumAi, where the catalogue carries it', () => {
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
    vi.stubEnv('AI_PLANNER_MODEL', '');
    expect(resolvePlannerModel()).toBe('openai/gpt-5.4');
  });

  it('leaves the choice to the gateway default anywhere else', () => {
    vi.stubEnv('AI_API_BASE', 'https://openrouter.ai/api/v1');
    vi.stubEnv('AI_PLANNER_MODEL', '');
    expect(resolvePlannerModel()).toBeUndefined();
  });
});

describe('resolvePlannerReasoningEffort', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to low: enough to hold the contract, fast enough for the route', () => {
    vi.stubEnv('AI_PLANNER_REASONING_EFFORT', '');
    expect(resolvePlannerReasoningEffort()).toBe('low');
  });

  it('honours a valid override, case-insensitively', () => {
    vi.stubEnv('AI_PLANNER_REASONING_EFFORT', 'High');
    expect(resolvePlannerReasoningEffort()).toBe('high');
    vi.stubEnv('AI_PLANNER_REASONING_EFFORT', 'none');
    expect(resolvePlannerReasoningEffort()).toBe('none');
  });

  it('falls back to low on a value the models would reject', () => {
    vi.stubEnv('AI_PLANNER_REASONING_EFFORT', 'maximum');
    expect(resolvePlannerReasoningEffort()).toBe('low');
  });
});
