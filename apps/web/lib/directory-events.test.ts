import { describe, expect, it } from 'vitest';
import {
  profileViewedProperties,
  requestAnsweredProperties,
  requestSentProperties,
} from './directory-events';

const NOW = new Date('2026-10-10T12:00:00.000Z');

describe('requestSentProperties', () => {
  it('carries the role and whether a rollout is attached, and nothing else', () => {
    const props = requestSentProperties({ role: 'producer', releaseId: 'r1', note: 'secret ask', recipientUserId: 'u2' });
    expect(props).toEqual({ role: 'producer', has_release: true });
  });

  it('reads a role outside the vocabulary as null, never as free text', () => {
    expect(requestSentProperties({ role: 'my private nickname', releaseId: null }).role).toBeNull();
    expect(requestSentProperties({ role: 'producer', releaseId: null }).has_release).toBe(false);
  });
});

describe('requestAnsweredProperties', () => {
  const sentAt = '2026-10-09T12:00:00.000Z';

  it('carries the answer, whether a reply was written, the role and hours to answer', () => {
    const props = requestAnsweredProperties(
      { role: 'mix_engineer', createdAt: sentAt, reply: 'Happy to, call me', status: 'interested' },
      NOW
    );
    expect(props).toEqual({ role: 'mix_engineer', answer: 'interested', has_reply: true, hours_to_answer: 24 });
  });

  it('never carries the reply text', () => {
    const props = requestAnsweredProperties(
      { role: 'pr', createdAt: sentAt, reply: 'my number is 0803', status: 'passed' },
      NOW
    );
    expect(JSON.stringify(props)).not.toContain('0803');
  });

  it('treats a blank reply as no reply and an unreadable date as null hours', () => {
    const props = requestAnsweredProperties({ role: 'pr', createdAt: 'nope', reply: '   ', status: 'passed' }, NOW);
    expect(props.has_reply).toBe(false);
    expect(props.hours_to_answer).toBeNull();
  });

  it('never goes negative when the clocks disagree', () => {
    const props = requestAnsweredProperties(
      { role: 'pr', createdAt: '2026-10-11T00:00:00.000Z', reply: null, status: 'interested' },
      NOW
    );
    expect(props.hours_to_answer).toBe(0);
  });
});

describe('profileViewedProperties', () => {
  it('names the first claimed role in the vocabulary and whether the profile is claimed', () => {
    expect(profileViewedProperties({ roles: ['not_a_role', 'photographer', 'pr'], claimed: true })).toEqual({
      surface: 'public_page',
      role: 'photographer',
      claimed: true,
    });
  });

  it('has no role for a profile with none, and carries no name', () => {
    const props = profileViewedProperties({ roles: [], claimed: false });
    expect(props.role).toBeNull();
    expect(Object.keys(props).sort()).toEqual(['claimed', 'role', 'surface']);
  });
});
