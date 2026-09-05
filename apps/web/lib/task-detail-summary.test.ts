import { describe, expect, it } from 'vitest';

import { buildTaskDetailSubtitle } from './task-detail-summary';

/**
 * The activity pop-up's one line of read-only summary, under the title:
 * "To do · Midnight EP · Due in 11 days".
 *
 * This is the only real decision in the 2026-09-05 simplification pass, so it
 * lives in lib/ where vitest can reach it — this repo has no component tests
 * (node environment, no jsdom), the same reason task-search, release-menu,
 * app-pages and release-search are all lib modules.
 */

const base = {
  statusLabel: 'To do',
  isEventMilestone: false,
  releaseTitle: 'Midnight EP',
  dueLabel: 'Due in 11 days',
  isOverdue: false,
};

describe('buildTaskDetailSubtitle', () => {
  it('reads status, release, then due', () => {
    expect(buildTaskDetailSubtitle(base).map((segment) => segment.text)).toEqual([
      'To do',
      'Midnight EP',
      'Due in 11 days',
    ]);
  });

  it('marks an event milestone right after the status', () => {
    const texts = buildTaskDetailSubtitle({ ...base, isEventMilestone: true }).map(
      (segment) => segment.text,
    );
    expect(texts).toEqual(['To do', 'Event', 'Midnight EP', 'Due in 11 days']);
  });

  it('skips the release when the activity has none', () => {
    const texts = buildTaskDetailSubtitle({ ...base, releaseTitle: null }).map(
      (segment) => segment.text,
    );
    expect(texts).toEqual(['To do', 'Due in 11 days']);
  });

  it('skips a release title that is only whitespace', () => {
    const texts = buildTaskDetailSubtitle({ ...base, releaseTitle: '   ' }).map(
      (segment) => segment.text,
    );
    expect(texts).toEqual(['To do', 'Due in 11 days']);
  });

  it('skips the due segment when there is no due label', () => {
    const texts = buildTaskDetailSubtitle({ ...base, dueLabel: '' }).map(
      (segment) => segment.text,
    );
    expect(texts).toEqual(['To do', 'Midnight EP']);
  });

  it('trims the values it keeps', () => {
    const texts = buildTaskDetailSubtitle({
      ...base,
      statusLabel: '  To do  ',
      releaseTitle: '  Midnight EP  ',
    }).map((segment) => segment.text);
    expect(texts).toEqual(['To do', 'Midnight EP', 'Due in 11 days']);
  });

  // The whole reason a segment carries a tone at all: an overdue activity has
  // to read as overdue, and only the due segment may say so.
  it('tones only the due segment as overdue', () => {
    const segments = buildTaskDetailSubtitle({ ...base, isOverdue: true });
    expect(segments.find((segment) => segment.text === 'Due in 11 days')?.tone).toBe('overdue');
    expect(segments.filter((segment) => segment.tone === 'overdue')).toHaveLength(1);
  });

  it('leaves every segment default when nothing is overdue', () => {
    expect(buildTaskDetailSubtitle(base).every((segment) => segment.tone === 'default')).toBe(true);
  });

  it('never tones a due segment it did not render', () => {
    const segments = buildTaskDetailSubtitle({ ...base, dueLabel: '', isOverdue: true });
    expect(segments.some((segment) => segment.tone === 'overdue')).toBe(false);
  });

  // A single segment must not arrive with a separator baked into it — the
  // component joins with a "·" between segments, so an orphaned separator
  // would be the visible bug.
  it('returns one segment when only the status is known', () => {
    const segments = buildTaskDetailSubtitle({
      ...base,
      releaseTitle: null,
      dueLabel: '',
    });
    expect(segments).toEqual([{ text: 'To do', tone: 'default' }]);
  });

  it('returns nothing when there is nothing to say', () => {
    expect(
      buildTaskDetailSubtitle({
        statusLabel: '',
        isEventMilestone: false,
        releaseTitle: null,
        dueLabel: '',
        isOverdue: false,
      }),
    ).toEqual([]);
  });
});
