import { describe, expect, it } from 'vitest';

import { TURN_BUDGET_MS } from '../chappi/routing';

import {
  DEFAULT_LADDER,
  MODEL_TIERS,
  clampTier,
  escalateTier,
  isModelTier,
  lowerTier,
  maxTier,
  readLadder,
  tierIndex,
  usesMaxCompletionTokens,
} from './model-ladder';

describe('the default ladder', () => {
  it('has the four approved rungs in cost order', () => {
    expect([...MODEL_TIERS]).toEqual(['quick', 'standard', 'pro', 'max']);
    expect(DEFAULT_LADDER.quick.models[0]).toBe('openai/gpt-4o-mini');
    expect(DEFAULT_LADDER.standard.models[0]).toBe('openai/gpt-5.4-mini');
    expect(DEFAULT_LADDER.pro.models[0]).toBe('openai/gpt-5.4');
    expect(DEFAULT_LADDER.max.models[0]).toBe('openai/gpt-5.5');
  });

  it('gives every rung a same-tier fallback that differs from its primary', () => {
    for (const tier of MODEL_TIERS) {
      const { models } = DEFAULT_LADDER[tier];
      expect(models.length).toBeGreaterThanOrEqual(2);
      expect(new Set(models).size).toBe(models.length);
    }
  });

  it('puts the same-price, higher-limit siblings behind the rate-limited rungs', () => {
    // Terra and Sol are capped at 10 requests a minute by the provider; these
    // are the models that carry the same work at three times the limit.
    expect(DEFAULT_LADDER.pro.models[1]).toBe('openai/gpt-5.6-terra');
    expect(DEFAULT_LADDER.max.models[1]).toBe('openai/gpt-5.6-sol');
  });

  it('gives each rung a positive token cap and a positive typical latency', () => {
    for (const tier of MODEL_TIERS) {
      expect(DEFAULT_LADDER[tier].maxOutputTokens).toBeGreaterThan(0);
      expect(DEFAULT_LADDER[tier].typicalLatencyMs).toBeGreaterThan(0);
    }
  });

  it('gets slower as it climbs', () => {
    for (let i = 1; i < MODEL_TIERS.length; i += 1) {
      const lower = DEFAULT_LADDER[MODEL_TIERS[i - 1]];
      const higher = DEFAULT_LADDER[MODEL_TIERS[i]];
      expect(higher.typicalLatencyMs).toBeGreaterThan(lower.typicalLatencyMs);
    }
  });

  it('gives every rung a streaming cap at least as high as its plain one', () => {
    // A streamed reply is cut at the deadline and kept, so its cap is not bounded
    // by speed the way the plain cap is. Lower than the plain cap would make
    // streaming write LESS than not streaming.
    for (const tier of MODEL_TIERS) {
      const rung = DEFAULT_LADDER[tier];
      expect(rung.streamMaxOutputTokens, tier).toBeGreaterThanOrEqual(rung.maxOutputTokens);
    }
  });

  it('lets every rung stream its whole token cap inside the turn budget', () => {
    // The max rung was capped at 8,192 and needed about 86 seconds to write it,
    // against 52 for the turn: the request was given up on and still billed in full.
    for (const tier of MODEL_TIERS) {
      const rung = DEFAULT_LADDER[tier];
      const secondsToWrite = rung.maxOutputTokens / rung.outputTokensPerSec;
      expect(rung.startupMs + secondsToWrite * 1000, tier).toBeLessThanOrEqual(TURN_BUDGET_MS);
    }
  });
});

describe('readLadder', () => {
  it('returns the defaults when nothing is set', () => {
    expect(readLadder({})).toEqual(DEFAULT_LADDER);
  });

  it('does not hand out the shared default arrays', () => {
    const ladder = readLadder({});
    ladder.pro.models.push('openai/x');
    expect(DEFAULT_LADDER.pro.models).not.toContain('openai/x');
  });

  it('reads a comma list per rung, primary first, trimming spaces', () => {
    const ladder = readLadder({ AI_LADDER_PRO: ' openai/gpt-5.4 , openai/gpt-5.5 ' });
    expect(ladder.pro.models).toEqual(['openai/gpt-5.4', 'openai/gpt-5.5']);
    // Other rungs are untouched.
    expect(ladder.max.models).toEqual(DEFAULT_LADDER.max.models);
  });

  it('accepts a single model with no comma', () => {
    expect(readLadder({ AI_LADDER_QUICK: 'openai/gpt-5.6-luna' }).quick.models).toEqual([
      'openai/gpt-5.6-luna',
    ]);
  });

  it('drops entries that are not model ids and de-duplicates', () => {
    const ladder = readLadder({
      AI_LADDER_STANDARD: 'openai/gpt-5.4-mini, "quoted", has space,openai/gpt-5.4-mini, ;drop, openai/gpt-5.6-luna',
    });
    expect(ladder.standard.models).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.6-luna']);
  });

  it('requires the vendor prefix, so a stray word is never taken for a model', () => {
    expect(readLadder({ AI_LADDER_QUICK: 'gpt-4o-mini' }).quick.models).toEqual(DEFAULT_LADDER.quick.models);
    expect(readLadder({ AI_LADDER_QUICK: 'oops, openai/gpt-4o-mini' }).quick.models).toEqual([
      'openai/gpt-4o-mini',
    ]);
  });

  it('accepts a space-separated list as well as a comma list', () => {
    expect(readLadder({ AI_LADDER_PRO: 'openai/gpt-5.4 openai/gpt-5.5' }).pro.models).toEqual([
      'openai/gpt-5.4',
      'openai/gpt-5.5',
    ]);
  });

  it('falls back to the default models when every entry is invalid', () => {
    expect(readLadder({ AI_LADDER_MAX: '!!!, ,;;' }).max.models).toEqual(DEFAULT_LADDER.max.models);
    expect(readLadder({ AI_LADDER_MAX: '' }).max.models).toEqual(DEFAULT_LADDER.max.models);
  });

  it('caps a rung at four models', () => {
    const ladder = readLadder({ AI_LADDER_PRO: 'a/1,a/2,a/3,a/4,a/5,a/6' });
    expect(ladder.pro.models).toHaveLength(4);
  });

  it('reads a per-rung reasoning effort, and lets "off" mean never send it', () => {
    expect(readLadder({ AI_LADDER_MAX_EFFORT: 'medium' }).max.reasoningEffort).toBe('medium');
    expect(readLadder({ AI_LADDER_MAX_EFFORT: ' HIGH ' }).max.reasoningEffort).toBe('high');
    expect(readLadder({ AI_LADDER_MAX_EFFORT: 'off' }).max.reasoningEffort).toBeNull();
  });

  it('ignores an effort the models would reject rather than failing every request on a typo', () => {
    expect(readLadder({ AI_LADDER_PRO_EFFORT: 'maximum' }).pro.reasoningEffort).toBe(
      DEFAULT_LADDER.pro.reasoningEffort
    );
  });
});

describe('tier helpers', () => {
  it('orders tiers by cost', () => {
    expect(tierIndex('quick')).toBe(0);
    expect(tierIndex('max')).toBe(3);
  });

  it('recognises tier names and nothing else', () => {
    expect(isModelTier('pro')).toBe(true);
    expect(isModelTier('PRO')).toBe(false);
    expect(isModelTier('gold')).toBe(false);
    expect(isModelTier(undefined)).toBe(false);
  });

  it('clamps a tier down to a ceiling and never up', () => {
    expect(clampTier('max', 'pro')).toBe('pro');
    expect(clampTier('quick', 'pro')).toBe('quick');
    expect(clampTier('pro', 'pro')).toBe('pro');
  });

  it('takes the higher of two tiers', () => {
    expect(maxTier('quick', 'pro')).toBe('pro');
    expect(maxTier('max', 'standard')).toBe('max');
  });

  it('steps one rung up or down and stops at the ends', () => {
    expect(escalateTier('quick')).toBe('standard');
    expect(escalateTier('max')).toBeNull();
    expect(lowerTier('max')).toBe('pro');
    expect(lowerTier('quick')).toBeNull();
  });
});

describe('usesMaxCompletionTokens', () => {
  it('is true for the GPT-5 and o-series families, with or without the vendor prefix', () => {
    for (const model of [
      'openai/gpt-5.6-sol',
      'openai/gpt-5.4-mini',
      'gpt-5.5',
      'openai/o4-mini',
      'o3',
    ]) {
      expect(usesMaxCompletionTokens(model)).toBe(true);
    }
  });

  it('is false for everything else, which still takes max_tokens', () => {
    for (const model of ['openai/gpt-4o-mini', 'openai/gpt-4.1', 'meta/llama-4', '', undefined, null]) {
      expect(usesMaxCompletionTokens(model as string | undefined | null)).toBe(false);
    }
  });
});
