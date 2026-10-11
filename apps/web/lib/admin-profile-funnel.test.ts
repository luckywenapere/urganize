import { describe, expect, it } from 'vitest';
import { buildProfileFunnel, stepRatioLabel, type ProfileFunnelInput } from './admin-profile-funnel';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const US = 'user-internal';
const THEM = 'user-them';

function input(over: Partial<ProfileFunnelInput> = {}): ProfileFunnelInput {
  return {
    now: NOW,
    internalUserIds: new Set([US]),
    workspaceOwners: new Map([
      ['ws-us', US],
      ['ws-them', THEM],
    ]),
    personOwners: new Map([
      ['p-us', US],
      ['p-them', THEM],
    ]),
    credits: [],
    unclaimedProfiles: [],
    invites: [],
    claimedProfiles: [],
    growthEvents: [],
    ...over,
  };
}

const count = (funnel: ReturnType<typeof buildProfileFunnel>, key: string) =>
  funnel.steps.find((step) => step.key === key)?.count;

describe('the profile funnel', () => {
  it('has the eight steps in order', () => {
    expect(buildProfileFunnel(input()).steps.map((step) => step.key)).toEqual([
      'credits_submitted',
      'unclaimed_profiles',
      'claim_emails_sent',
      'claimed',
      'published',
      'profile_views',
      'cta_clicks',
      'signups',
    ]);
  });

  it('counts the last 30 days only', () => {
    const funnel = buildProfileFunnel(
      input({
        credits: [
          { owner_user_id: THEM, created_at: ago(1) },
          { owner_user_id: THEM, created_at: ago(29) },
          { owner_user_id: THEM, created_at: ago(31) },
          { owner_user_id: THEM, created_at: null },
        ],
      })
    );
    expect(count(funnel, 'credits_submitted')).toBe(2);
  });

  it('leaves our own accounts out of every step', () => {
    const funnel = buildProfileFunnel(
      input({
        credits: [
          { owner_user_id: US, created_at: ago(1) },
          { owner_user_id: THEM, created_at: ago(1) },
        ],
        unclaimedProfiles: [
          { created_at: ago(1), created_by_workspace_id: 'ws-us' },
          { created_at: ago(1), created_by_workspace_id: 'ws-them' },
          { created_at: ago(1), created_by_workspace_id: null },
        ],
        invites: [
          { channel: 'email', sent_at: ago(1), created_at: ago(1), created_by: US },
          { channel: 'email', sent_at: ago(1), created_at: ago(1), created_by: THEM },
          { channel: 'link', sent_at: null, created_at: ago(2), created_by: THEM },
        ],
        claimedProfiles: [
          { user_id: US, claimed_at: ago(1), visibility: 'public' },
          { user_id: THEM, claimed_at: ago(1), visibility: 'public' },
          { user_id: 'user-3', claimed_at: ago(1), visibility: 'private' },
        ],
        growthEvents: [
          { kind: 'profile_view', person_id: 'p-us', user_id: null, created_at: ago(1) },
          { kind: 'profile_view', person_id: 'p-them', user_id: null, created_at: ago(1) },
          { kind: 'profile_view', person_id: null, user_id: null, created_at: ago(1) },
          { kind: 'cta_click', person_id: 'p-us', user_id: null, created_at: ago(1) },
          { kind: 'cta_click', person_id: 'p-them', user_id: null, created_at: ago(1) },
          { kind: 'signup', person_id: 'p-them', user_id: US, created_at: ago(1) },
          { kind: 'signup', person_id: 'p-them', user_id: 'user-new', created_at: ago(1) },
        ],
      })
    );
    expect(count(funnel, 'credits_submitted')).toBe(1);
    expect(count(funnel, 'unclaimed_profiles')).toBe(2);
    expect(count(funnel, 'claim_emails_sent')).toBe(1);
    expect(funnel.steps.find((s) => s.key === 'claim_emails_sent')?.aside).toEqual({
      label: 'Claim links shared by hand',
      count: 1,
    });
    expect(count(funnel, 'claimed')).toBe(2);
    expect(count(funnel, 'published')).toBe(1);
    expect(count(funnel, 'profile_views')).toBe(2);
    expect(count(funnel, 'cta_clicks')).toBe(1);
    expect(count(funnel, 'signups')).toBe(1);
  });

  it('a claim email counts by when it was sent, not when the invite was made', () => {
    const funnel = buildProfileFunnel(
      input({ invites: [{ channel: 'email', sent_at: ago(40), created_at: ago(1), created_by: THEM }] })
    );
    expect(count(funnel, 'claim_emails_sent')).toBe(0);
  });

  it('reads Not tracked (null), never zero, when the growth table is missing', () => {
    const funnel = buildProfileFunnel(input({ growthEvents: null }));
    expect(count(funnel, 'profile_views')).toBeNull();
    expect(count(funnel, 'cta_clicks')).toBeNull();
    expect(count(funnel, 'signups')).toBeNull();
    expect(count(funnel, 'credits_submitted')).toBe(0);
  });
});

describe('the ratio under a step', () => {
  it('is a share below the step before, a multiple above it', () => {
    expect(stepRatioLabel(10, 4)).toBe('40% of the step before');
    expect(stepRatioLabel(4, 10)).toBe('2.5 times the step before');
    expect(stepRatioLabel(4, 4)).toBe('1.0 times the step before');
  });

  it('says nothing when it cannot be worked out', () => {
    expect(stepRatioLabel(0, 4)).toBeNull();
    expect(stepRatioLabel(null, 4)).toBeNull();
    expect(stepRatioLabel(4, null)).toBeNull();
  });
});
