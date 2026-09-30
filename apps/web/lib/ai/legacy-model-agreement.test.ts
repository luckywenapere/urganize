import { afterEach, describe, expect, it, vi } from 'vitest';

import { legacyModelFor } from './model-router';
import { resolvePlannerModel } from './planner-model';

// "With AI_ROUTER unset, nothing changes" only holds if the router's idea of the
// model each feature used before it existed is the same as what those features
// really did. Two of them are computed in more than one place (the planner's
// default lives in planner-model.ts as well as in the router), and the others
// were an inline `process.env.X || undefined` at each call site until the calls
// moved. This pins the router's copy to the originals, across the awkward env
// shapes, so the two cannot drift apart unnoticed.

afterEach(() => {
  vi.unstubAllEnvs();
});

const PLANNER_ENVS: Array<Record<string, string>> = [
  {},
  { AI_PLANNER_MODEL: 'openai/gpt-5.4-mini' },
  { AI_PLANNER_MODEL: '  openai/gpt-5.4-mini  ' },
  { AI_PLANNER_MODEL: '   ' },
  { AI_API_BASE: 'https://api.rodiumai.io' },
  { AI_API_BASE: 'https://api.rodiumai.io/' },
  { AI_API_BASE: 'https://api.rodiumai.io/v1' },
  { AI_API_BASE: 'https://API.RODIUMAI.IO' },
  { AI_API_BASE: 'https://eu.rodiumai.io' },
  { AI_API_BASE: 'https://notrodiumai.io' },
  { AI_API_BASE: 'https://rodiumai.io.evil.example' },
  { AI_API_BASE: 'api.rodiumai.io' },
  { AI_API_BASE: 'https://openrouter.ai/api/v1' },
  { AI_API_BASE: 'https://urganize-main-34fd8f6.d2.zuplo.dev' },
  { AI_API_BASE: 'https://api.rodiumai.io', AI_PLANNER_MODEL: 'openai/gpt-5.5' },
  { AI_API_BASE: 'https://openrouter.ai/api/v1', AI_PLANNER_MODEL: 'openai/gpt-5.5' },
];

describe('the router\'s idea of the planner\'s model is the planner\'s real one', () => {
  for (const env of PLANNER_ENVS) {
    it(`agrees for ${JSON.stringify(env)}`, () => {
      vi.stubEnv('AI_API_BASE', '');
      vi.stubEnv('AI_PLANNER_MODEL', '');
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

      expect(legacyModelFor('planner', env)).toBe(resolvePlannerModel());
    });
  }
});

describe('the router\'s idea of the other features\' models is what their call sites used to say', () => {
  // The expressions the call sites carried before they moved to the routed
  // wrappers, copied here on purpose: this test is the record of them.
  const original = {
    status: (env: Record<string, string | undefined>) => env.AI_STATUS_MODEL || undefined,
    outcome: (env: Record<string, string | undefined>) => env.AI_OUTCOME_MODEL || env.AI_STATUS_MODEL || undefined,
    press_kit: (env: Record<string, string | undefined>) => env.AI_PRESSKIT_MODEL || env.AI_STATUS_MODEL || undefined,
  } as const;

  const ENVS: Array<Record<string, string>> = [
    {},
    { AI_STATUS_MODEL: 'openai/a' },
    { AI_OUTCOME_MODEL: 'openai/o' },
    { AI_PRESSKIT_MODEL: 'openai/p' },
    { AI_STATUS_MODEL: 'openai/a', AI_OUTCOME_MODEL: 'openai/o', AI_PRESSKIT_MODEL: 'openai/p' },
    { AI_STATUS_MODEL: 'openai/a', AI_PRESSKIT_MODEL: 'openai/p' },
  ];

  for (const surface of ['status', 'outcome', 'press_kit'] as const) {
    for (const env of ENVS) {
      it(`agrees for ${surface} with ${JSON.stringify(env)}`, () => {
        expect(legacyModelFor(surface, env)).toBe(original[surface](env));
      });
    }
  }

  it('is the one deliberate difference: a value of only spaces counts as unset instead of being sent as a model id', () => {
    expect(original.status({ AI_STATUS_MODEL: '   ' })).toBe('   ');
    expect(legacyModelFor('status', { AI_STATUS_MODEL: '   ' })).toBeUndefined();
  });
});
