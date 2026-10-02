import { describe, expect, it } from 'vitest';

import { isPaywallRefusal, shouldAdmitCreditsOnly } from './urgans-admission';

const READ_ONLY = 'READ_ONLY';

const admit = (over: Partial<Parameters<typeof shouldAdmitCreditsOnly>[0]> = {}) =>
  shouldAdmitCreditsOnly({
    creditsEnabled: true,
    refusal: { status: 402 },
    readOnlyCode: READ_ONLY,
    team: { state: 'walled', tier: 'label', primaryWorkspaceId: 'ws-1' },
    ...over,
  });

describe('isPaywallRefusal', () => {
  it('counts a 402 and the read-only 403, and nothing else', () => {
    expect(isPaywallRefusal({ status: 402 }, READ_ONLY)).toBe(true);
    expect(isPaywallRefusal({ status: 402, code: 'ACCESS_REQUIRED' }, READ_ONLY)).toBe(true);
    expect(isPaywallRefusal({ status: 403, code: READ_ONLY }, READ_ONLY)).toBe(true);
  });

  it('does not count a bad token, a curator account, a missing setting or a plain 403', () => {
    expect(isPaywallRefusal({ status: 401 }, READ_ONLY)).toBe(false);
    expect(isPaywallRefusal({ status: 403 }, READ_ONLY)).toBe(false);
    expect(isPaywallRefusal({ status: 403, code: 'SOMETHING_ELSE' }, READ_ONLY)).toBe(false);
    expect(isPaywallRefusal({ status: 404 }, READ_ONLY)).toBe(false);
    expect(isPaywallRefusal({ status: 500 }, READ_ONLY)).toBe(false);
    expect(isPaywallRefusal({ status: 200, code: READ_ONLY }, READ_ONLY)).toBe(false);
  });
});

describe('shouldAdmitCreditsOnly', () => {
  it('admits a walled team and a read-only team when the paywall refused them', () => {
    expect(admit()).toBe(true);
    expect(admit({ team: { state: 'read_only', tier: 'manager', primaryWorkspaceId: 'ws-1' }, refusal: { status: 403, code: READ_ONLY } })).toBe(true);
  });

  it('admits nobody when credits are off', () => {
    expect(admit({ creditsEnabled: false })).toBe(false);
  });

  it('admits nobody for a refusal that was not the paywall', () => {
    for (const refusal of [{ status: 401 }, { status: 403 }, { status: 403, code: 'X' }, { status: 500 }, { status: 404 }]) {
      expect(admit({ refusal }), JSON.stringify(refusal)).toBe(false);
    }
  });

  it('admits nobody without a team, such as a playlist owner', () => {
    expect(admit({ team: undefined })).toBe(false);
    expect(admit({ team: { state: 'walled', primaryWorkspaceId: null } })).toBe(false);
    expect(admit({ team: { state: 'walled' } })).toBe(false);
  });

  it('admits only a credits-only account: a trial, a paying team and a comped team are not it', () => {
    for (const state of ['trial', 'grace', 'paid', 'comped']) {
      expect(admit({ team: { state, tier: 'manager', primaryWorkspaceId: 'ws-1' } }), state).toBe(false);
    }
  });

  it('treats a state it does not recognise as credits-only, the same as the credit rules do', () => {
    expect(admit({ team: { state: 'something-new', primaryWorkspaceId: 'ws-1' } })).toBe(true);
  });
});
