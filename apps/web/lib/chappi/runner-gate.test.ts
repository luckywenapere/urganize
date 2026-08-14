import { describe, expect, it } from 'vitest';
import { resolveToolInvocation } from './runner';
import type { ChappiTool } from './tools';

// Minimal stand-ins: resolveToolInvocation only ever looks at `confirm`.
const ungated = { name: 'list_releases', confirm: undefined } as unknown as ChappiTool;
const gated = { name: 'delete_release', confirm: async () => ({ ok: true }) } as unknown as ChappiTool;

/**
 * The security-critical branch, isolated from the model loop so it can be
 * asserted without a live gateway. The property under test: a gated tool can
 * never resolve to 'execute' from inside a model turn, whatever the model does.
 */
describe('resolveToolInvocation', () => {
  it('executes an ungated tool', () => {
    expect(resolveToolInvocation(ungated, false)).toEqual({ action: 'execute' });
  });

  it('proposes — never executes — a gated tool', () => {
    expect(resolveToolInvocation(gated, false)).toEqual({ action: 'propose' });
  });

  it('refuses a second gated tool while one is already awaiting approval', () => {
    const decision = resolveToolInvocation(gated, true);
    expect(decision.action).toBe('refuse');
    if (decision.action === 'refuse') {
      expect(decision.summary).toMatch(/waiting for the user to approve/i);
    }
  });

  it('still executes ungated tools while a confirmation is pending', () => {
    // A pending card blocks further PROPOSALS, not ordinary reads — the model
    // should still be able to look things up while the user decides.
    expect(resolveToolInvocation(ungated, true)).toEqual({ action: 'execute' });
  });

  it('defers unknown tools to dispatch, which owns the error copy', () => {
    expect(resolveToolInvocation(undefined, false)).toEqual({ action: 'execute' });
  });
});
