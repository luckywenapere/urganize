import { describe, expect, it } from 'vitest';

import {
  RODI_PER_USD,
  REQUEST_FAILED,
  costOfCall,
  describeProbe,
  extractEvalUsage,
  formatCaseMatrix,
  formatSummaryTable,
  percentile,
  priceFromCatalogue,
  scoreAnswer,
  scoreToolChoice,
  summarizeLatency,
  summarizeModel,
  type EvalRun,
  type EvalUsage,
  type ModelPrice,
  type ToolExpectation,
} from './model-eval';

const KNOWN = new Set(['list_tasks', 'create_task', 'get_release', 'schedule_release', 'update_release', 'navigate']);
const call = (name: string, args = '{}') => ({ name, arguments: args });

describe('scoreToolChoice', () => {
  const reads: ToolExpectation = { tools: ['list_tasks', 'get_release'] };

  it('passes when the first call is one of the accepted tools', () => {
    expect(scoreToolChoice(reads, [call('list_tasks')], KNOWN)).toEqual({ pass: true, reason: 'ok' });
    expect(scoreToolChoice(reads, [call('get_release')], KNOWN)).toEqual({ pass: true, reason: 'ok' });
  });

  it('judges only the FIRST call: what comes after it cannot rescue or sink the case', () => {
    expect(scoreToolChoice(reads, [call('list_tasks'), call('schedule_release')], KNOWN).pass).toBe(true);
    expect(scoreToolChoice(reads, [call('schedule_release'), call('list_tasks')], KNOWN)).toEqual({
      pass: false,
      reason: 'wrong_tool',
    });
  });

  it('fails a real tool that is the wrong one', () => {
    expect(scoreToolChoice(reads, [call('update_release')], KNOWN)).toEqual({ pass: false, reason: 'wrong_tool' });
  });

  it('calls a tool the registry has never heard of by its own name, ahead of "wrong"', () => {
    expect(scoreToolChoice(reads, [call('fetch_everything')], KNOWN)).toEqual({ pass: false, reason: 'unknown_tool' });
    // Even when the case would have accepted no tool at all.
    expect(scoreToolChoice({ tools: [], allowNone: true }, [call('fetch_everything')], KNOWN).reason).toBe(
      'unknown_tool'
    );
  });

  it('fails no tool at all when one was needed, and passes it when words alone are allowed', () => {
    expect(scoreToolChoice(reads, [], KNOWN)).toEqual({ pass: false, reason: 'no_tool' });
    expect(scoreToolChoice({ tools: ['list_tasks'], allowNone: true }, [], KNOWN).pass).toBe(true);
  });

  it('holds a restraint case to no tool: any real call is unexpected', () => {
    const restraint: ToolExpectation = { tools: [], allowNone: true };
    expect(scoreToolChoice(restraint, [], KNOWN).pass).toBe(true);
    expect(scoreToolChoice(restraint, [call('list_tasks')], KNOWN)).toEqual({ pass: false, reason: 'unexpected_tool' });
  });

  describe('required arguments', () => {
    const create: ToolExpectation = {
      tools: ['create_task'],
      requireArgs: { tool: 'create_task', keys: ['releaseId', 'title'] },
    };

    it('passes when every key is present', () => {
      expect(scoreToolChoice(create, [call('create_task', '{"releaseId":"r1","title":"Brief","extra":1}')], KNOWN).pass).toBe(
        true
      );
    });

    it('fails a key that is missing, null or empty, but never looks at its value', () => {
      for (const args of ['{"releaseId":"r1"}', '{"releaseId":"r1","title":null}', '{"releaseId":"r1","title":""}']) {
        expect(scoreToolChoice(create, [call('create_task', args)], KNOWN)).toEqual({
          pass: false,
          reason: 'missing_args',
        });
      }
    });

    it('fails arguments that are not a JSON object', () => {
      for (const args of ['{not json', '[1,2]', '"text"', 'null']) {
        expect(scoreToolChoice(create, [call('create_task', args)], KNOWN)).toEqual({
          pass: false,
          reason: 'bad_arguments',
        });
      }
    });

    it('treats empty argument text as an empty object, so its keys are missing rather than malformed', () => {
      expect(scoreToolChoice(create, [call('create_task', '')], KNOWN).reason).toBe('missing_args');
    });

    it('does not check arguments when the first call is a different accepted tool', () => {
      const either: ToolExpectation = {
        tools: ['create_task', 'get_release'],
        requireArgs: { tool: 'create_task', keys: ['title'] },
      };
      expect(scoreToolChoice(either, [call('get_release', '{}')], KNOWN).pass).toBe(true);
    });
  });
});

describe('scoreAnswer', () => {
  const restraint: ToolExpectation = { tools: [], allowNone: true };

  it('fails a turn that said nothing and did nothing, even where no tool call was the right answer', () => {
    expect(scoreAnswer(restraint, { calls: [], text: '' }, KNOWN)).toEqual({ pass: false, reason: 'empty_answer' });
    expect(scoreAnswer(restraint, { calls: [], text: '   \n ' }, KNOWN).reason).toBe('empty_answer');
  });

  it('passes words with no tool call where that was right', () => {
    expect(scoreAnswer(restraint, { calls: [], text: 'Urganize holds no streaming numbers.' }, KNOWN).pass).toBe(true);
  });

  it('leaves everything else to the tool scoring', () => {
    expect(scoreAnswer({ tools: ['list_tasks'] }, { calls: [call('list_tasks')], text: '' }, KNOWN).pass).toBe(true);
    expect(scoreAnswer({ tools: ['list_tasks'] }, { calls: [], text: 'sure' }, KNOWN).reason).toBe('no_tool');
    expect(scoreAnswer(restraint, { calls: [call('list_tasks')], text: '' }, KNOWN).reason).toBe('unexpected_tool');
  });

  it('does not let words rescue a wrong tool call', () => {
    expect(scoreAnswer({ tools: ['list_tasks'] }, { calls: [call('update_release')], text: 'On it.' }, KNOWN).reason).toBe(
      'wrong_tool'
    );
  });
});

describe('percentile', () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('is the nearest rank', () => {
    expect(percentile(ten, 50)).toBe(5);
    expect(percentile(ten, 90)).toBe(9);
    expect(percentile(ten, 100)).toBe(10);
    expect(percentile(ten, 10)).toBe(1);
  });

  it('does not depend on the order it is given', () => {
    expect(percentile([9, 1, 5, 3, 7, 2, 10, 4, 8, 6], 90)).toBe(9);
  });

  it('handles one value, none, and clamps a percentile outside 0-100', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([], 50)).toBeNull();
    expect(percentile(ten, 0)).toBe(1);
    expect(percentile(ten, 250)).toBe(10);
  });

  it('ignores values that are not numbers', () => {
    expect(percentile([1, Number.NaN, 3, Number.POSITIVE_INFINITY], 50)).toBe(1);
  });
});

describe('summarizeLatency', () => {
  it('summarises a list', () => {
    expect(summarizeLatency([100, 200, 300, 400])).toEqual({ count: 4, p50: 200, p90: 400, max: 400, mean: 250 });
  });

  it('is all null for none, not zero', () => {
    expect(summarizeLatency([])).toEqual({ count: 0, p50: null, p90: null, max: null, mean: null });
  });
});

describe('extractEvalUsage', () => {
  it('reads OpenAI-shaped usage including the cached part of the prompt', () => {
    expect(
      extractEvalUsage({
        usage: { prompt_tokens: 14_000, completion_tokens: 220, prompt_tokens_details: { cached_tokens: 13_500 } },
      })
    ).toEqual({ promptTokens: 14_000, completionTokens: 220, cachedTokens: 13_500 });
  });

  it('leaves cached null when the gateway did not say, which is not zero', () => {
    expect(extractEvalUsage({ usage: { prompt_tokens: 10, completion_tokens: 2 } })).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      cachedTokens: null,
    });
  });

  it('keeps one half when only one half is there', () => {
    expect(extractEvalUsage({ usage: { prompt_tokens: 10 } })).toEqual({
      promptTokens: 10,
      completionTokens: null,
      cachedTokens: null,
    });
  });

  it('is null for anything without usable usage', () => {
    for (const payload of [null, undefined, 'x', 3, {}, { usage: null }, { usage: {} }, { usage: { prompt_tokens: '5' } }]) {
      expect(extractEvalUsage(payload)).toBeNull();
    }
  });
});

describe('priceFromCatalogue', () => {
  it('reads string prices as the catalogue lists them, cached included', () => {
    expect(
      priceFromCatalogue({
        id: 'x',
        rodiumai_pricing: { input_per_1m: '557.4', output_per_1m: '3341.1', cached_input_per_1m: '55.7' },
      })
    ).toEqual({ inputPer1M: 557.4, outputPer1M: 3341.1, cachedInputPer1M: 55.7 });
  });

  it('accepts numbers, and leaves cached null when it is not listed', () => {
    expect(priceFromCatalogue({ rodiumai_pricing: { input_per_1m: 111, output_per_1m: 446 } })).toEqual({
      inputPer1M: 111,
      outputPer1M: 446,
      cachedInputPer1M: null,
    });
  });

  it('is null unless BOTH input and output are usable', () => {
    for (const entry of [
      undefined,
      {},
      { rodiumai_pricing: {} },
      { rodiumai_pricing: { input_per_1m: '1' } },
      { rodiumai_pricing: { output_per_1m: '1' } },
      { rodiumai_pricing: { input_per_1m: 'free', output_per_1m: '1' } },
      { rodiumai_pricing: { input_per_1m: '-1', output_per_1m: '1' } },
    ]) {
      expect(priceFromCatalogue(entry)).toBeNull();
    }
  });
});

describe('costOfCall', () => {
  const price: ModelPrice = { inputPer1M: 1_000, outputPer1M: 4_000, cachedInputPer1M: 100 };

  it('prices fresh input, cached input and output separately', () => {
    // 6,000 fresh at 1,000 + 4,000 cached at 100 + 500 out at 4,000, per million.
    const usage: EvalUsage = { promptTokens: 10_000, completionTokens: 500, cachedTokens: 4_000 };
    const cost = costOfCall(usage, price);
    expect(cost?.rodi).toBeCloseTo((6_000 * 1_000 + 4_000 * 100 + 500 * 4_000) / 1_000_000, 10);
    expect(cost?.usd).toBeCloseTo((cost?.rodi ?? 0) / RODI_PER_USD, 10);
  });

  it('charges cached tokens at the full input price when the catalogue lists no cached price', () => {
    const cost = costOfCall(
      { promptTokens: 1_000, completionTokens: 0, cachedTokens: 400 },
      { inputPer1M: 1_000, outputPer1M: 4_000, cachedInputPer1M: null }
    );
    expect(cost?.rodi).toBeCloseTo(1, 10);
  });

  it('treats a missing cached count as none cached', () => {
    const cost = costOfCall({ promptTokens: 1_000, completionTokens: 0, cachedTokens: null }, price);
    expect(cost?.rodi).toBeCloseTo(1, 10);
  });

  it('cannot cache more than the prompt: an impossible count is held to the prompt', () => {
    const cost = costOfCall({ promptTokens: 1_000, completionTokens: 0, cachedTokens: 9_999 }, price);
    expect(cost?.rodi).toBeCloseTo((1_000 * 100) / 1_000_000, 10);
  });

  it('is null rather than a guess when the usage or the price is missing or half-reported', () => {
    expect(costOfCall(null, price)).toBeNull();
    expect(costOfCall({ promptTokens: 1, completionTokens: 1, cachedTokens: null }, null)).toBeNull();
    expect(costOfCall({ promptTokens: null, completionTokens: 1, cachedTokens: null }, price)).toBeNull();
    expect(costOfCall({ promptTokens: 1, completionTokens: null, cachedTokens: null }, price)).toBeNull();
  });
});

describe('summarizeModel', () => {
  const price: ModelPrice = { inputPer1M: 1_000, outputPer1M: 2_000, cachedInputPer1M: 100 };
  const usage = (promptTokens: number, completionTokens: number, cachedTokens: number | null): EvalUsage => ({
    promptTokens,
    completionTokens,
    cachedTokens,
  });
  const run = (over: Partial<EvalRun> & Pick<EvalRun, 'caseId'>): EvalRun => ({
    model: 'm/a',
    verdict: { pass: true, reason: 'ok' },
    latencyMs: 1_000,
    usage: usage(1_000, 100, 0),
    firstTool: 'list_tasks',
    ...over,
  });

  it('measures accuracy over the runs that were ANSWERED, not the ones a rate limit ate', () => {
    const summary = summarizeModel(
      'm/a',
      [
        run({ caseId: 'a' }),
        run({ caseId: 'b', verdict: { pass: false, reason: 'wrong_tool' }, firstTool: 'update_release' }),
        run({ caseId: 'c', verdict: REQUEST_FAILED, latencyMs: null, usage: null, firstTool: null }),
        run({ caseId: 'd' }),
      ],
      price
    );
    expect(summary.runs).toBe(4);
    expect(summary.answered).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.accuracy).toBeCloseTo(2 / 3, 10);
    expect(summary.requestFailures).toBe(1);
    expect(summary.failures).toEqual([{ caseId: 'b', reason: 'wrong_tool', firstTool: 'update_release' }]);
  });

  it('reports no accuracy when nothing was answered', () => {
    const summary = summarizeModel('m/a', [run({ caseId: 'a', verdict: REQUEST_FAILED, usage: null, latencyMs: null })], price);
    expect(summary.accuracy).toBeNull();
    expect(summary.usdTotal).toBeNull();
    expect(summary.usdPerCall).toBeNull();
  });

  it('only counts runs for its own model', () => {
    const summary = summarizeModel('m/a', [run({ caseId: 'a' }), run({ caseId: 'a', model: 'm/other' })], price);
    expect(summary.runs).toBe(1);
  });

  it('totals tokens, cache share and cost', () => {
    const summary = summarizeModel(
      'm/a',
      [run({ caseId: 'a', usage: usage(10_000, 100, 0) }), run({ caseId: 'b', usage: usage(10_000, 100, 9_000) })],
      price
    );
    expect(summary.tokensIn).toBe(20_000);
    expect(summary.tokensOut).toBe(200);
    expect(summary.cachedShare).toBeCloseTo(9_000 / 20_000, 10);
    // First call: 10,000 fresh; second: 1,000 fresh + 9,000 cached; both 100 out.
    const expectedRodi = (10_000 * 1_000 + 100 * 2_000 + (1_000 * 1_000 + 9_000 * 100 + 100 * 2_000)) / 1_000_000;
    expect(summary.usdTotal).toBeCloseTo(expectedRodi / RODI_PER_USD, 10);
    expect(summary.usdPerCall).toBeCloseTo(expectedRodi / RODI_PER_USD / 2, 10);
  });

  it('leaves the cache share null when the gateway never reported a cached count', () => {
    const summary = summarizeModel('m/a', [run({ caseId: 'a', usage: usage(1_000, 10, null) })], price);
    expect(summary.cachedShare).toBeNull();
  });

  it('averages cost over the calls that could be costed, not all of them', () => {
    const summary = summarizeModel(
      'm/a',
      [run({ caseId: 'a', usage: usage(1_000, 100, 0) }), run({ caseId: 'b', usage: null })],
      price
    );
    expect(summary.usdPerCall).toBeCloseTo(summary.usdTotal ?? 0, 10);
  });

  it('summarises latency over answered runs only', () => {
    const summary = summarizeModel(
      'm/a',
      [run({ caseId: 'a', latencyMs: 2_000 }), run({ caseId: 'b', latencyMs: 4_000 }), run({ caseId: 'c', verdict: REQUEST_FAILED, latencyMs: null, usage: null })],
      price
    );
    expect(summary.latency.count).toBe(2);
    expect(summary.latency.mean).toBe(3_000);
  });
});

describe('describeProbe', () => {
  it('accepts any 2xx', () => {
    expect(describeProbe(200, '{"choices":[]}')).toEqual({ accepted: true, status: 200, message: '' });
  });

  it('pulls the gateway\'s own message out of a JSON error, nested or flat', () => {
    expect(describeProbe(400, JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'" } })).message).toBe(
      "Unsupported parameter: 'max_tokens'"
    );
    expect(describeProbe(400, JSON.stringify({ error: 'bad request' })).message).toBe('bad request');
    expect(describeProbe(429, JSON.stringify({ message: 'slow down' })).message).toBe('slow down');
  });

  it('keeps the start of text that is not JSON, collapsed and capped', () => {
    const outcome = describeProbe(502, `<html>\n  Bad   gateway ${'x'.repeat(500)}`);
    expect(outcome.accepted).toBe(false);
    expect(outcome.message.startsWith('<html> Bad gateway')).toBe(true);
    expect(outcome.message.length).toBe(200);
  });
});

describe('the reports', () => {
  it('lays a summary table out with a row per model and no NaN or undefined', () => {
    const table = formatSummaryTable([
      summarizeModel('openai/gpt-4o-mini', [], null),
      summarizeModel(
        'openai/gpt-5.4',
        [
          {
            caseId: 'a',
            model: 'openai/gpt-5.4',
            verdict: { pass: true, reason: 'ok' },
            latencyMs: 12_345,
            usage: { promptTokens: 14_000, completionTokens: 300, cachedTokens: 13_000 },
            firstTool: 'list_tasks',
          },
        ],
        { inputPer1M: 1_856, outputPer1M: 11_137, cachedInputPer1M: 185 }
      ),
    ]);
    expect(table).toContain('openai/gpt-4o-mini');
    expect(table).toContain('openai/gpt-5.4');
    expect(table).toContain('12.3');
    expect(table).toContain('100%');
    expect(table).not.toMatch(/NaN|undefined|Infinity/);
    expect(table.split('\n')).toHaveLength(4);
  });

  it('draws the case matrix with a legend and one mark a cell, a missing cell reading as not run', () => {
    const matrix = formatCaseMatrix(
      [
        { caseId: 'lookup', tier: 'quick', cells: { 'openai/a': 'pass', 'openai/b': 'pass' } },
        { caseId: 'strategy', tier: 'standard', cells: { 'openai/a': 'fail', 'openai/b': 'error' } },
        { caseId: 'late', tier: 'quick', cells: { 'openai/a': 'pass' } },
      ],
      ['openai/a', 'openai/b']
    );
    expect(matrix).toContain('1=a  2=b');
    const lines = matrix.split('\n');
    expect(lines.find((line) => line.startsWith('lookup'))?.endsWith('P P')).toBe(true);
    expect(lines.find((line) => line.startsWith('strategy'))?.endsWith('x !')).toBe(true);
    expect(lines.find((line) => line.startsWith('late'))?.endsWith('P .')).toBe(true);
  });
});
