import { describe, expect, it } from 'vitest';
import { summarizeDirectory } from './directory-admin-summary';

const supply = (over: Partial<Parameters<typeof summarizeDirectory>[0]> = {}) => ({
  profiles: [],
  records: [],
  demand: [],
  ...over,
});

describe('summarizeDirectory', () => {
  it('counts listed people per claimed role', () => {
    const summary = summarizeDirectory(
      supply({ profiles: [{ roles: ['pr', 'graphic_designer'] }, { roles: ['pr'] }] })
    );
    expect(summary.byRole.find((row) => row.role === 'pr')?.listed).toBe(2);
    expect(summary.byRole.find((row) => row.role === 'graphic_designer')?.listed).toBe(1);
  });

  it('counts PEOPLE with a record, not records', () => {
    // Somebody who delivered artwork on four releases is one designer, not
    // four. Supply is how many people you can call.
    const summary = summarizeDirectory(
      supply({
        records: [
          { userId: 'u1', role: 'graphic_designer' },
          { userId: 'u1', role: 'graphic_designer' },
          { userId: 'u2', role: 'graphic_designer' },
        ],
      })
    );
    const row = summary.byRole.find((entry) => entry.role === 'graphic_designer');
    expect(row?.delivered).toBe(2);
  });

  it('splits demand into wanted and unmet', () => {
    const summary = summarizeDirectory(
      supply({
        demand: [
          { role: 'pr', matched: false, source: 'search' },
          { role: 'pr', matched: true, source: 'search' },
          { role: 'pr', matched: false, source: 'role_gap' },
        ],
      })
    );
    const row = summary.byRole.find((entry) => entry.role === 'pr');
    expect(row?.wanted).toBe(3);
    expect(row?.unmet).toBe(2);
  });

  it('keeps plan-seeded demand apart from typed demand', () => {
    // The role gaps panel is the retention mechanic. Whether it actually drives
    // search is a different question from whether managers search at all, and
    // folding the two together makes it unanswerable.
    const summary = summarizeDirectory(
      supply({
        demand: [
          { role: 'pr', matched: false, source: 'role_gap' },
          { role: 'pr', matched: false, source: 'search' },
          { role: 'pr', matched: false, source: 'search' },
        ],
      })
    );
    const row = summary.byRole.find((entry) => entry.role === 'pr');
    expect(row?.fromRoleGaps).toBe(1);
  });

  it('ranks the recruiting list by unmet demand', () => {
    const summary = summarizeDirectory(
      supply({
        demand: [
          { role: 'pr', matched: false, source: 'search' },
          { role: 'videographer', matched: false, source: 'search' },
          { role: 'videographer', matched: false, source: 'search' },
        ],
      })
    );
    expect(summary.recruit.map((row) => row.role)).toEqual(['videographer', 'pr']);
  });

  it('leaves a role with nobody to call on the recruiting list even when demand is even', () => {
    const summary = summarizeDirectory(
      supply({
        records: [{ userId: 'u1', role: 'pr' }],
        demand: [
          { role: 'pr', matched: false, source: 'search' },
          { role: 'videographer', matched: false, source: 'search' },
        ],
      })
    );
    // Both were wanted once and neither matched. The one with nobody who has
    // ever delivered it is the one to recruit for.
    expect(summary.recruit[0].role).toBe('videographer');
  });

  it('recruits for nothing nobody asked for', () => {
    // A role with no demand is not a gap, it is a role nobody needs. Listing
    // every empty role would bury the two that matter.
    const summary = summarizeDirectory(supply({ profiles: [{ roles: ['pr'] }] }));
    expect(summary.recruit).toEqual([]);
  });

  it('omits a role with no supply and no demand from the table entirely', () => {
    const summary = summarizeDirectory(supply({ profiles: [{ roles: ['pr'] }] }));
    expect(summary.byRole.map((row) => row.role)).toEqual(['pr']);
  });

  it('ignores a role outside the vocabulary rather than inventing a row', () => {
    const summary = summarizeDirectory(
      supply({ profiles: [{ roles: ['wizard'] }], records: [{ userId: 'u1', role: 'wizard' }] })
    );
    expect(summary.byRole).toEqual([]);
  });

  it('totals what it counted', () => {
    const summary = summarizeDirectory(
      supply({
        profiles: [{ roles: ['pr'] }, { roles: [] }],
        records: [{ userId: 'u1', role: 'pr' }],
        demand: [{ role: 'pr', matched: false, source: 'search' }],
      })
    );
    expect(summary.totals).toEqual({ listed: 2, withARecord: 1, wanted: 1, unmet: 1 });
  });
});
