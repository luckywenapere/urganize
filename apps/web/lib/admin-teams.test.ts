import { describe, expect, it } from 'vitest';
import {
  ACTION_EVENT_TYPE,
  ADMIN_ASSIGNABLE_PLANS,
  MAX_EXTEND_DAYS,
  parseTeamAdminAction,
} from './admin-teams';

const WS = '11111111-2222-3333-4444-555555555555';

const ok = (body: unknown) => {
  const result = parseTeamAdminAction(body);
  if ('error' in result) throw new Error(`expected success, got: ${result.error}`);
  return result.action;
};

const err = (body: unknown): string => {
  const result = parseTeamAdminAction(body);
  if (!('error' in result)) throw new Error('expected a rejection');
  return result.error;
};

describe('parseTeamAdminAction — shape', () => {
  it('requires a body and a workspace', () => {
    expect(err(null)).toContain('JSON body');
    expect(err('string')).toContain('JSON body');
    expect(err({ action: 'comp' })).toContain('workspaceId');
    expect(err({ action: 'comp', workspaceId: 'short' })).toContain('workspaceId');
  });

  it('rejects an unknown action rather than silently doing nothing', () => {
    expect(err({ action: 'delete_everything', workspaceId: WS })).toBe('Unknown action.');
    expect(err({ workspaceId: WS })).toBe('Unknown action.');
  });

  it('every action maps to an event, so none can be recorded silently', () => {
    for (const key of [
      'extend_trial',
      'comp',
      'uncomp',
      'assign_founding',
      'set_custom_price',
      'mark_paid',
    ] as const) {
      expect(ACTION_EVENT_TYPE[key]).toBeTruthy();
    }
  });
});

// SPEC CASE 6: admin extend / comp.
describe('parseTeamAdminAction — extend and comp', () => {
  it('accepts a sane extension', () => {
    expect(ok({ action: 'extend_trial', workspaceId: WS, days: 14 })).toEqual({
      type: 'extend_trial',
      workspaceId: WS,
      days: 14,
      note: null,
    });
  });

  it('refuses zero, negative, fractional and absurd day counts', () => {
    for (const days of [0, -5, 1.5, MAX_EXTEND_DAYS + 1, 100000]) {
      expect(err({ action: 'extend_trial', workspaceId: WS, days })).toContain('days must be');
    }
  });

  it('refuses a missing or unparseable day count', () => {
    expect(err({ action: 'extend_trial', workspaceId: WS })).toContain('days must be');
    expect(err({ action: 'extend_trial', workspaceId: WS, days: 'ten' })).toContain('days must be');
  });

  it('comp and uncomp need nothing but the team', () => {
    expect(ok({ action: 'comp', workspaceId: WS })).toEqual({
      type: 'comp',
      workspaceId: WS,
      note: null,
    });
    expect(ok({ action: 'uncomp', workspaceId: WS })).toEqual({
      type: 'uncomp',
      workspaceId: WS,
    });
  });

  it('keeps an admin note, trimmed and capped', () => {
    const action = ok({ action: 'comp', workspaceId: WS, note: '  design partner  ' });
    expect(action).toMatchObject({ note: 'design partner' });

    const long = ok({ action: 'comp', workspaceId: WS, note: 'x'.repeat(5000) });
    expect((long as { note: string }).note.length).toBe(2000);
  });

  it('treats a blank note as no note', () => {
    expect(ok({ action: 'comp', workspaceId: WS, note: '   ' })).toMatchObject({ note: null });
  });
});

describe('parseTeamAdminAction — deals', () => {
  it('records a founding price lock in kobo', () => {
    expect(
      ok({ action: 'assign_founding', workspaceId: WS, amountMinorUnit: 5_000_000, note: 'launch cohort' })
    ).toEqual({
      type: 'assign_founding',
      workspaceId: WS,
      amountMinorUnit: 5_000_000,
      note: 'launch cohort',
    });
  });

  it('records a custom negotiated rate', () => {
    expect(ok({ action: 'set_custom_price', workspaceId: WS, amountMinorUnit: 6_000_000 })).toEqual({
      type: 'set_custom_price',
      workspaceId: WS,
      amountMinorUnit: 6_000_000,
      note: null,
    });
  });

  it('refuses amounts that are not positive whole kobo, rather than coercing them', () => {
    for (const amountMinorUnit of [0, -1, 1.5, 'lots', null, undefined]) {
      expect(err({ action: 'assign_founding', workspaceId: WS, amountMinorUnit })).toContain(
        'kobo'
      );
    }
  });
});

describe('parseTeamAdminAction — mark paid (invoice and transfer deals)', () => {
  const base = {
    action: 'mark_paid',
    workspaceId: WS,
    plan: 'annual',
    amountMinorUnit: 80_000_000,
    expiresAt: '2027-08-21T00:00:00.000Z',
  };

  it('accepts a complete record and normalises the date', () => {
    expect(ok(base)).toEqual({
      type: 'mark_paid',
      workspaceId: WS,
      plan: 'annual',
      amountMinorUnit: 80_000_000,
      expiresAt: '2027-08-21T00:00:00.000Z',
      billingInterval: null,
      note: null,
    });
  });

  it('accepts every plan an admin may assign', () => {
    for (const plan of ADMIN_ASSIGNABLE_PLANS) {
      expect(ok({ ...base, plan, billingInterval: 'monthly' })).toMatchObject({ plan });
    }
  });

  it('records Group as enterprise, from either name, with how often it is billed', () => {
    expect(ok({ ...base, plan: 'Group', billingInterval: 'yearly' })).toMatchObject({
      plan: 'enterprise',
      billingInterval: 'annual',
    });
    expect(ok({ ...base, plan: 'enterprise', billingInterval: 'monthly' })).toMatchObject({
      plan: 'enterprise',
      billingInterval: 'monthly',
    });
  });

  it('refuses a Group deal that does not say how often it is billed', () => {
    expect(err({ ...base, plan: 'group' })).toContain('billingInterval');
    expect(err({ ...base, plan: 'group', billingInterval: 'weekly' })).toContain('billingInterval');
  });

  it('refuses a nonsense interval on any plan, and leaves it out when not given', () => {
    expect(err({ ...base, billingInterval: 'fortnightly' })).toContain('billingInterval');
    expect(ok({ ...base, billingInterval: '' })).toMatchObject({ billingInterval: null });
  });

  it('refuses a plan the schema would reject, including the contactSales tier', () => {
    for (const plan of ['label', 'trial_card', 'gift', '', null]) {
      expect(err({ ...base, plan })).toContain('plan must be one of');
    }
  });

  it('requires a real date, since this is what grants access', () => {
    expect(err({ ...base, expiresAt: 'whenever' })).toContain('expiresAt');
    expect(err({ ...base, expiresAt: undefined })).toContain('expiresAt');
  });

  it('keeps the note, which is where the invoice reference lives', () => {
    expect(ok({ ...base, note: 'INV-2026-114, bank transfer' })).toMatchObject({
      note: 'INV-2026-114, bank transfer',
    });
  });
});
