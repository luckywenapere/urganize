import { describe, expect, it } from 'vitest';
import { summarizeLeadStats } from './directory-lead-stats';

const release = (status: string | null, isTest = false) => ({ status, isTest });

describe('summarizeLeadStats', () => {
  it('counts rollouts run and the ones still active', () => {
    const stats = summarizeLeadStats({
      releases: [release('draft'), release('released'), release('archived'), release(null)],
      artistCount: 2,
      teamMembers: 3,
      records: [],
    });
    expect(stats.rolloutsRun).toBe(4);
    expect(stats.activeRollouts).toBe(2);
    expect(stats.artistsManaged).toBe(2);
    expect(stats.teamSize).toBe(3);
  });

  it('does not count a test rollout as one run or one active', () => {
    const stats = summarizeLeadStats({
      releases: [release('draft', true), release('draft')],
      artistCount: 0,
      teamMembers: 0,
      records: [],
    });
    expect(stats.rolloutsRun).toBe(1);
    expect(stats.activeRollouts).toBe(1);
    expect(stats.releases).toBe(1);
  });

  it('counts distinct rollouts and shows worked on, not records', () => {
    const stats = summarizeLeadStats({
      releases: [],
      artistCount: 0,
      teamMembers: 0,
      records: [
        { releaseId: 'a', showId: null },
        { releaseId: 'a', showId: null },
        { releaseId: 'b', showId: null },
        { releaseId: null, showId: 's1' },
        { releaseId: null, showId: 's1' },
      ],
    });
    expect(stats.rolloutsWorkedOn).toBe(2);
    expect(stats.shows).toBe(1);
  });

  it('turns a bad count into zero rather than a negative or a fraction', () => {
    const stats = summarizeLeadStats({
      releases: [],
      artistCount: -3,
      teamMembers: Number.NaN,
      records: [],
    });
    expect(stats.artistsManaged).toBe(0);
    expect(stats.teamSize).toBe(0);
  });
});
