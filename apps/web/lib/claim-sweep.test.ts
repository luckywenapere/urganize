import { describe, expect, it } from 'vitest';
import { planCreditProfiles, summarizeSweep, type SweepContext, type SweepSubmission } from './claim-sweep';

const sub = (over: Partial<SweepSubmission> & { id: string }): SweepSubmission => ({
  releaseId: 'r1',
  email: null,
  phone: null,
  confirmedAccurate: true,
  personHidden: false,
  ...over,
});
const ctx = (over: Partial<SweepContext> = {}): SweepContext => ({
  deliveredReleaseIds: new Set(['r1', 'r2']),
  accountEmails: new Set(),
  personByIdentifier: new Map(),
  ...over,
});
const only = (s: SweepSubmission, c = ctx()) => planCreditProfiles([s], c)[0];

describe('planCreditProfiles', () => {
  it('creates a profile for a delivered, attested credit with an email', () => {
    expect(only(sub({ id: 'a', email: 'tobi@x.com' }))).toMatchObject({ kind: 'create' });
  });
  it('skips a rollout that has not come out', () => {
    expect(only(sub({ id: 'a', email: 'tobi@x.com', releaseId: 'r9' }))).toMatchObject({
      kind: 'skip',
      reason: 'not_delivered',
    });
  });
  it('skips a credit nobody attested to', () => {
    expect(only(sub({ id: 'a', email: 'tobi@x.com', confirmedAccurate: false }))).toMatchObject({
      reason: 'not_confirmed',
    });
  });
  it('skips a credit already hidden', () => {
    expect(only(sub({ id: 'a', email: 'tobi@x.com', personHidden: true }))).toMatchObject({ reason: 'hidden' });
  });
  it('never works from a name: no email and no phone means no profile', () => {
    expect(only(sub({ id: 'a' }))).toMatchObject({ kind: 'skip', reason: 'no_contact' });
    expect(only(sub({ id: 'a', email: 'not an email', phone: 'call me' }))).toMatchObject({ reason: 'no_contact' });
  });
  it('skips somebody who already has an account', () => {
    const c = ctx({ accountEmails: new Set(['tobi@x.com']) });
    expect(only(sub({ id: 'a', email: 'Tobi@X.com' }), c)).toMatchObject({ kind: 'skip', reason: 'has_account' });
  });
  it('links to a profile that already exists, email first then phone', () => {
    const c = ctx({
      personByIdentifier: new Map([
        ['email:tobi@x.com', { personId: 'p-email' }],
        ['phone:+2348031234567', { personId: 'p-phone' }],
      ]),
    });
    expect(only(sub({ id: 'a', email: 'tobi@x.com', phone: '08031234567' }), c)).toEqual({
      kind: 'link',
      submissionId: 'a',
      personId: 'p-email',
    });
    expect(only(sub({ id: 'a', phone: '08031234567' }), c)).toMatchObject({ kind: 'link', personId: 'p-phone' });
  });
  it('an existing profile wins over an account, so a person who opted in is linked', () => {
    const c = ctx({
      accountEmails: new Set(['tobi@x.com']),
      personByIdentifier: new Map([['email:tobi@x.com', { personId: 'p1' }]]),
    });
    expect(only(sub({ id: 'a', email: 'tobi@x.com' }), c)).toMatchObject({ kind: 'link' });
  });
  it('makes ONE profile for credits that share an email or a phone, across rollouts', () => {
    const out = planCreditProfiles(
      [
        sub({ id: 'a', email: 'tobi@x.com' }),
        sub({ id: 'b', email: 'tobi@x.com', releaseId: 'r2' }),
        sub({ id: 'c', phone: '08031234567' }),
        sub({ id: 'd', email: 'someone@else.com' }),
      ],
      ctx()
    );
    const groups = out.map((d) => (d.kind === 'create' ? d.group : -1));
    expect(groups[0]).toBe(groups[1]);
    expect(groups[2]).not.toBe(groups[0]);
    expect(new Set(groups).size).toBe(3);
  });
  it('merges two groups a later credit bridges', () => {
    const out = planCreditProfiles(
      [
        sub({ id: 'a', email: 'tobi@x.com' }),
        sub({ id: 'b', phone: '08031234567' }),
        sub({ id: 'c', email: 'tobi@x.com', phone: '08031234567' }),
      ],
      ctx()
    );
    expect(new Set(out.map((d) => (d.kind === 'create' ? d.group : -1))).size).toBe(1);
  });
  it('does not group two different people', () => {
    const out = planCreditProfiles(
      [sub({ id: 'a', email: 'a@x.com' }), sub({ id: 'b', email: 'b@x.com' })],
      ctx()
    );
    expect(new Set(out.map((d) => (d.kind === 'create' ? d.group : -1))).size).toBe(2);
  });
});

describe('summarizeSweep', () => {
  it('counts profiles, not credits, and reports each skip reason', () => {
    const decisions = planCreditProfiles(
      [
        sub({ id: 'a', email: 'tobi@x.com' }),
        sub({ id: 'b', email: 'tobi@x.com', releaseId: 'r2' }),
        sub({ id: 'c', releaseId: 'nope', email: 'z@x.com' }),
        sub({ id: 'd' }),
      ],
      ctx()
    );
    const s = summarizeSweep(decisions);
    expect(s.wouldCreate).toBe(1);
    expect(s.skipped.not_delivered).toBe(1);
    expect(s.skipped.no_contact).toBe(1);
    expect(s.scanned).toBe(4);
  });
});
