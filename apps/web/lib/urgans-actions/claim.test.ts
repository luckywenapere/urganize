import { describe, expect, it } from 'vitest';
import { APPLY_CLAIM_STALE_MS, decideApplyClaim, type UrgansActionRowForClaim } from './claim';

const NOW = new Date('2026-09-03T12:00:00.000Z');
const at = (offsetMs: number): string => new Date(NOW.getTime() + offsetMs).toISOString();

const row = (partial: Partial<UrgansActionRowForClaim>): UrgansActionRowForClaim => ({
  status: 'drafted',
  appliedResult: null,
  updatedAt: null,
  ...partial,
});

describe('decideApplyClaim', () => {
  it('drafted rows may be claimed', () => {
    expect(decideApplyClaim(row({ status: 'drafted' }), NOW)).toEqual({ kind: 'claim' });
  });

  it('an applied row with a result returns it, and writes nothing', () => {
    const result = { tasksCreated: 64, taskIds: ['a', 'b'] };
    expect(
      decideApplyClaim(row({ status: 'applied', appliedResult: result }), NOW)
    ).toEqual({ kind: 'return_cached', result });
  });

  it('an applied row with a result of literal false or 0 still counts as present', () => {
    // appliedResult holds whatever an action's apply() returned; a falsy but
    // real result must not be mistaken for "no result yet".
    expect(decideApplyClaim(row({ status: 'applied', appliedResult: false }), NOW)).toEqual({
      kind: 'return_cached',
      result: false,
    });
    expect(decideApplyClaim(row({ status: 'applied', appliedResult: 0 }), NOW)).toEqual({
      kind: 'return_cached',
      result: 0,
    });
  });

  it('an applied row with no result, claimed moments ago, is in progress', () => {
    expect(
      decideApplyClaim(
        row({ status: 'applied', appliedResult: null, updatedAt: at(-5_000) }),
        NOW
      )
    ).toEqual({ kind: 'in_progress' });
  });

  it('the boundary is inclusive on the stale side: one ms under is in progress, exactly at it reclaims', () => {
    expect(
      decideApplyClaim(
        row({ status: 'applied', appliedResult: null, updatedAt: at(-APPLY_CLAIM_STALE_MS + 1) }),
        NOW
      )
    ).toEqual({ kind: 'in_progress' });
    expect(
      decideApplyClaim(
        row({ status: 'applied', appliedResult: null, updatedAt: at(-APPLY_CLAIM_STALE_MS) }),
        NOW
      )
    ).toEqual({ kind: 'reclaim' });
  });

  it('an applied row with no result, claimed well past the stale threshold, may be reclaimed', () => {
    expect(
      decideApplyClaim(
        row({ status: 'applied', appliedResult: null, updatedAt: at(-APPLY_CLAIM_STALE_MS - 1) }),
        NOW
      )
    ).toEqual({ kind: 'reclaim' });
  });

  it('an unparseable or missing updatedAt on a resultless applied row reclaims rather than jamming', () => {
    expect(
      decideApplyClaim(row({ status: 'applied', appliedResult: null, updatedAt: null }), NOW)
    ).toEqual({ kind: 'reclaim' });
    expect(
      decideApplyClaim(row({ status: 'applied', appliedResult: null, updatedAt: 'garbage' }), NOW)
    ).toEqual({ kind: 'reclaim' });
  });

  it('discarded rows are refused, distinctly from failed ones', () => {
    expect(decideApplyClaim(row({ status: 'discarded' }), NOW)).toEqual({
      kind: 'refused',
      reason: 'discarded',
    });
    expect(decideApplyClaim(row({ status: 'failed' }), NOW)).toEqual({
      kind: 'refused',
      reason: 'failed',
    });
  });

  // Mutation guard: this is the one branch the build plan calls out by name
  // ("flip the status === 'drafted' compare"). Inverting it would claim every
  // non-drafted row instead of only drafted ones — assert the shape strongly
  // enough that flipping the compare fails this exact expectation.
  it('only a drafted row ever produces a bare claim decision', () => {
    for (const status of ['applied', 'discarded', 'failed'] as const) {
      const decision = decideApplyClaim(row({ status, appliedResult: 'x', updatedAt: at(0) }), NOW);
      expect(decision.kind).not.toBe('claim');
    }
  });
});
