import { describe, expect, it } from 'vitest';

import {
  attachUsageToError,
  buildUsageRows,
  isUuid,
  MAX_USAGE_ROWS,
  usageFromError,
  type UsageLogContext,
} from './usage-log';
import { providerCostRodi } from '@/lib/credits/pricing';

const RELEASE = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const WORKSPACE = '11111111-2222-4333-8444-555555555555';

const context = (over: Partial<UsageLogContext> = {}): UsageLogContext => ({
  requestId: 'req-1',
  feature: 'chat',
  workspaceId: WORKSPACE,
  ownerUserId: 'owner-1',
  actorUserId: 'actor-1',
  releaseId: RELEASE,
  ...over,
});

const call = (over: Partial<{ model: string; promptTokens: number | null; completionTokens: number | null; cachedTokens: number | null }> = {}) => ({
  model: 'openai/gpt-4o-mini',
  promptTokens: 1000,
  completionTokens: 200,
  cachedTokens: 0,
  ...over,
});

describe('buildUsageRows', () => {
  it('writes one row per call, numbered from 0, with the cost worked out the way credits work it out', () => {
    const rows = buildUsageRows({ context: context(), calls: [call(), call({ promptTokens: 2000 })], failures: [], creditsCharged: 3 });
    expect(rows.map((row) => row.call_index)).toEqual([0, 1]);
    expect(rows[0].cost_rodi).toBeCloseTo(providerCostRodi(call()).rodi, 3);
    expect(rows[1].cost_rodi).toBeCloseTo(providerCostRodi(call({ promptTokens: 2000 })).rodi, 3);
    expect(rows.every((row) => row.status === 'ok')).toBe(true);
  });

  it('carries the tokens, the cached tokens and the model on each row', () => {
    const [row] = buildUsageRows({
      context: context(),
      calls: [call({ model: 'openai/gpt-5.4', promptTokens: 5000, completionTokens: 700, cachedTokens: 4000 })],
      failures: [],
      creditsCharged: 0,
    });
    expect(row).toMatchObject({ model: 'openai/gpt-5.4', tokens_in: 5000, tokens_out: 700, tokens_cached: 4000 });
  });

  it('puts the credits charged on the first row only, so a sum over a release counts them once', () => {
    const rows = buildUsageRows({ context: context(), calls: [call(), call(), call()], failures: [], creditsCharged: 7 });
    expect(rows.map((row) => row.credits_charged)).toEqual([7, 0, 0]);
  });

  it('marks a cost as assumed when the gateway reported no tokens', () => {
    const [row] = buildUsageRows({
      context: context(),
      calls: [call({ promptTokens: null, completionTokens: null })],
      failures: [],
      creditsCharged: 1,
    });
    expect(row.cost_assumed).toBe(true);
    expect(row.tokens_in).toBeNull();
  });

  it('records a failed call as failed, with its kind and an UNKNOWN cost, never zero', () => {
    const rows = buildUsageRows({
      context: context(),
      calls: [call()],
      failures: [{ model: 'openai/gpt-5.5', kind: 'timeout' }],
      creditsCharged: 0,
    });
    const failed = rows.find((row) => row.status === 'failed');
    expect(failed).toMatchObject({ model: 'openai/gpt-5.5', failure_kind: 'timeout', cost_rodi: null, tokens_in: null });
    expect(failed?.call_index).toBe(1);
  });

  it('keeps the calls that happened before a failure, so a failed turn still shows what it cost', () => {
    const rows = buildUsageRows({ context: context(), calls: [call(), call()], failures: [{ model: null, kind: 'timeout' }], creditsCharged: 0 });
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.status === 'ok')).toHaveLength(2);
    expect(rows[2].model).toBeNull();
  });

  it('writes nothing when nothing happened', () => {
    expect(buildUsageRows({ context: context(), calls: [], failures: [], creditsCharged: 0 })).toEqual([]);
  });

  it('drops a release id that is not a uuid, because one bad id would reject the whole insert', () => {
    const [row] = buildUsageRows({ context: context({ releaseId: 'not-a-uuid' }), calls: [call()], failures: [], creditsCharged: 0 });
    expect(row.release_id).toBeNull();
  });

  it('keeps a valid release id and leaves it null when there is none', () => {
    expect(buildUsageRows({ context: context(), calls: [call()], failures: [], creditsCharged: 0 })[0].release_id).toBe(RELEASE);
    expect(buildUsageRows({ context: context({ releaseId: null }), calls: [call()], failures: [], creditsCharged: 0 })[0].release_id).toBeNull();
  });

  it('drops a workspace id that is not a uuid as well', () => {
    const [row] = buildUsageRows({ context: context({ workspaceId: 'x' }), calls: [call()], failures: [], creditsCharged: 0 });
    expect(row.workspace_id).toBeNull();
  });

  it('is bounded: a run with a runaway number of calls writes at most MAX_USAGE_ROWS rows', () => {
    const rows = buildUsageRows({ context: context(), calls: Array.from({ length: 80 }, () => call()), failures: [], creditsCharged: 9 });
    expect(rows).toHaveLength(MAX_USAGE_ROWS);
    expect(rows[0].credits_charged).toBe(9);
  });

  it('never lets a negative or fractional charge through', () => {
    const [row] = buildUsageRows({ context: context(), calls: [call()], failures: [], creditsCharged: -4.6 });
    expect(row.credits_charged).toBe(0);
    const [rounded] = buildUsageRows({ context: context(), calls: [call()], failures: [], creditsCharged: 4.6 });
    expect(rounded.credits_charged).toBe(5);
  });

  it('carries the request id on every row, which is how the ledger spend is joined back', () => {
    const rows = buildUsageRows({ context: context({ requestId: 'embedded:abc' }), calls: [call(), call()], failures: [], creditsCharged: 1 });
    expect(rows.every((row) => row.request_id === 'embedded:abc')).toBe(true);
  });
});

describe('isUuid', () => {
  it('accepts a uuid and rejects everything else', () => {
    expect(isUuid(RELEASE)).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe('usage carried on an error', () => {
  it('lets the route read what a failed turn had already used', () => {
    const error = new Error('gateway timed out');
    attachUsageToError(error, { usageCalls: [call()], failedCalls: [{ model: 'm', kind: 'timeout' }] });
    expect(usageFromError(error)).toEqual({ usageCalls: [call()], failedCalls: [{ model: 'm', kind: 'timeout' }] });
  });

  it('answers empty for an error that carries nothing, and for a value that is not an object', () => {
    expect(usageFromError(new Error('x'))).toEqual({ usageCalls: [], failedCalls: [] });
    expect(usageFromError('a string')).toEqual({ usageCalls: [], failedCalls: [] });
    expect(usageFromError(null)).toEqual({ usageCalls: [], failedCalls: [] });
  });

  it('does not throw when asked to attach to something that is not an object', () => {
    expect(() => attachUsageToError('boom', { usageCalls: [], failedCalls: [] })).not.toThrow();
  });
});
