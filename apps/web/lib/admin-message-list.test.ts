import { describe, expect, it } from 'vitest';
import {
  STAGE_INFO,
  firstName,
  isMailtoSafeEmail,
  messageMailto,
  stageLine,
  stalledStage,
  type StageFacts,
} from './admin-message-list';

const done: StageFacts = {
  realReleases: 2,
  members: 3,
  firstInviteAt: '2026-08-01T00:00:00.000Z',
  paying: true,
  firstLiveAt: '2026-08-20T00:00:00.000Z',
  secondReleaseStarted: true,
};

describe('stalledStage', () => {
  it('follows the strategy doc order: activate, convert, first release, second release, expand', () => {
    expect(stalledStage({ ...done, realReleases: 0, members: 1, firstInviteAt: null })).toEqual({
      stage: 'activate',
      missing: 'No rollout or teammate yet',
    });
    expect(stalledStage({ ...done, realReleases: 0 }).missing).toBe('No rollout yet');
    expect(stalledStage({ ...done, members: 1, firstInviteAt: null }).missing).toBe('No teammate yet');
    expect(stalledStage({ ...done, paying: false, firstLiveAt: null }).stage).toBe('convert');
    expect(stalledStage({ ...done, firstLiveAt: null, secondReleaseStarted: false }).stage).toBe('first_release');
    expect(stalledStage({ ...done, secondReleaseStarted: false }).stage).toBe('second_release');
    expect(stalledStage(done).stage).toBe('expand');
  });

  it('counts a pending invite as a teammate, even before they join', () => {
    expect(stalledStage({ ...done, members: 1 }).stage).toBe('expand');
  });

  it('puts a team that is neither paying nor activated at Activate, the earlier stage', () => {
    expect(stalledStage({ ...done, paying: false, realReleases: 0, firstLiveAt: null }).stage).toBe('activate');
  });

  it('puts a paying team with no rollout at Activate, not past it', () => {
    expect(stalledStage({ ...done, realReleases: 0, firstLiveAt: null }).stage).toBe('activate');
  });
});

describe('stage words', () => {
  it('names the stage number and its owner from the strategy doc', () => {
    expect(stageLine('convert')).toBe('Stage 4, Convert. Lucky writes');
    expect(stageLine('activate')).toBe('Stage 3, Activate. Chidera writes');
    expect(Object.values(STAGE_INFO).map((info) => info.number)).toEqual([3, 4, 5, 6, 7]);
  });

  it('firstName takes the first word, null for nothing', () => {
    expect(firstName('  Ada  Obi ')).toBe('Ada');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});

describe('messageMailto', () => {
  it('opens a draft to the owner only, with the team in the subject and a first-name greeting', () => {
    const link = messageMailto({ email: 'ada@example.com', ownerName: 'Ada Obi', teamName: 'Obi & Co', stage: 'convert' });
    expect(link).not.toBeNull();
    const url = new URL(link as string);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('ada@example.com');
    expect(url.searchParams.get('subject')).toBe('Checking in on Obi & Co');
    expect(url.searchParams.get('body')?.startsWith('Hi Ada,\n\n')).toBe(true);
    expect(url.searchParams.has('cc')).toBe(false);
    expect(url.searchParams.has('bcc')).toBe(false);
    // Spaces are %20, never "+", which some mail apps print as a plus.
    expect(link).not.toContain('+');
  });

  it('falls back to "Hi," and a plain subject when names are missing', () => {
    const url = new URL(messageMailto({ email: 'a@b.co', ownerName: null, teamName: null, stage: 'expand' }) as string);
    expect(url.searchParams.get('subject')).toBe('Checking in');
    expect(url.searchParams.get('body')?.startsWith('Hi,\n\n')).toBe(true);
  });

  it('gives no link when the email is missing or could add a recipient or header', () => {
    for (const email of [null, '', 'not-an-email', 'a@b.co,c@d.co', 'a@b.co?cc=x@y.co', 'a b@c.co', 'a@b.co#x', 'a@b.co;c@d.co']) {
      expect(isMailtoSafeEmail(email)).toBe(false);
      expect(messageMailto({ email, ownerName: 'A', teamName: 'T', stage: 'activate' })).toBeNull();
    }
    expect(isMailtoSafeEmail('first.last+urg@mail.example.ng')).toBe(true);
  });

  it('has a different opener for each stage', () => {
    const bodies = (Object.keys(STAGE_INFO) as Array<keyof typeof STAGE_INFO>).map(
      (stage) => new URL(messageMailto({ email: 'a@b.co', ownerName: null, teamName: null, stage }) as string).searchParams.get('body')
    );
    expect(new Set(bodies).size).toBe(bodies.length);
  });
});
