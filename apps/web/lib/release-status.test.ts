import { describe, expect, it } from 'vitest';
import { describeStatusFacts, type StatusFacts } from './release-status';

// The figures a generated paragraph was written from, printed beside it so a
// manager can check the AI's narration against the data.
//
// They were a row of tiles (`buildStatusTiles`, rendered by StatTiles) whose
// only home was the modal behind the "Status update" pill. Both that pill and
// the recap's went into the UrgAns conversation on 2026-09-07 (founder calls),
// so the tiles and their builder are deleted and this line is the whole
// surface. Two properties matter, both inherited from the tiles: a zero is
// never printed, and there is no line at all when there is nothing to say.
describe('describeStatusFacts', () => {
  const facts = (over: Partial<StatusFacts> = {}): StatusFacts => ({
    totalCount: 64,
    doneCount: 12,
    inProgressCount: 0,
    blockedCount: 0,
    dueThisWeekCount: 0,
    ...over,
  });

  it('always leads with progress against the total', () => {
    expect(describeStatusFacts(facts())).toBe('Based on 12 of 64 done.');
  });

  it('omits every zero figure rather than printing it', () => {
    const line = describeStatusFacts(facts());
    expect(line).not.toContain('0 blocked');
    expect(line).not.toContain('in progress');
    expect(line).not.toContain('due this week');
  });

  it('includes each non-zero figure, in the tiles’ own order', () => {
    expect(
      describeStatusFacts(
        facts({ inProgressCount: 3, dueThisWeekCount: 5, blockedCount: 2 })
      )
    ).toBe('Based on 12 of 64 done, 3 in progress, 5 due this week, 2 blocked.');
  });

  it('drops the denominator on a release with no activities', () => {
    // "0 of 0 done" is noise; the paragraph already says there is no plan.
    expect(describeStatusFacts(facts({ totalCount: 0, doneCount: 0 }))).toBe('');
  });

  it('says nothing when there is nothing to verify', () => {
    // A release whose only fact is "no activities" gets no facts line, so the
    // reply is the paragraph alone rather than a paragraph plus an empty claim.
    expect(describeStatusFacts(facts({ totalCount: 0, doneCount: 0 }))).toBe('');
  });

  it('handles a finished release without special-casing it', () => {
    expect(describeStatusFacts(facts({ doneCount: 64 }))).toBe('Based on 64 of 64 done.');
  });
});
