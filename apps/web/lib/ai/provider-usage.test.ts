import { describe, expect, it } from 'vitest';
import { extractAiUsage } from './provider';

describe('extractAiUsage', () => {
  it('reads the OpenAI protocol shape (OpenRouter, RodiumAi)', () => {
    expect(
      extractAiUsage({
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 412, completion_tokens: 88, total_tokens: 500 },
      })
    ).toEqual({ promptTokens: 412, completionTokens: 88 });
  });

  it('reads the Ollama protocol shape (the Zuplo gateway), a top-level pair with no usage object', () => {
    expect(
      extractAiUsage({
        message: { content: '{}' },
        prompt_eval_count: 300,
        eval_count: 64,
      })
    ).toEqual({ promptTokens: 300, completionTokens: 64 });
  });

  it('returns null when neither shape is present, rather than a zeroed-out object', () => {
    expect(extractAiUsage({ message: { content: '{}' } })).toBeNull();
    expect(extractAiUsage({})).toBeNull();
  });

  it('tolerates a usage object present but empty, falling through to null', () => {
    expect(extractAiUsage({ usage: {} })).toBeNull();
  });

  it('keeps whichever half is reported when only one is present', () => {
    expect(extractAiUsage({ usage: { prompt_tokens: 200 } })).toEqual({
      promptTokens: 200,
      completionTokens: null,
    });
    expect(extractAiUsage({ eval_count: 40 })).toEqual({
      promptTokens: null,
      completionTokens: 40,
    });
  });

  it('ignores non-numeric fields rather than coercing them', () => {
    expect(
      extractAiUsage({ usage: { prompt_tokens: '412', completion_tokens: null } })
    ).toBeNull();
  });

  it('prefers the OpenAI shape when a payload somehow carries both', () => {
    expect(
      extractAiUsage({
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        prompt_eval_count: 999,
        eval_count: 999,
      })
    ).toEqual({ promptTokens: 10, completionTokens: 5 });
  });
});
