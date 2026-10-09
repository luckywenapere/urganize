import { describe, expect, it } from 'vitest';
import { describeTaskLine } from './task-line';

// Noon on 8 October 2026, local time, so "today" is unambiguous.
const NOW = new Date(2026, 9, 8, 12, 0, 0);
const day = (offset: number) => new Date(2026, 9, 8 + offset, 9, 0, 0).toISOString();

function line(
  over: Partial<{ title: string; releaseTitle: string | null; artistName: string | null; dueDate: string | null }> = {},
) {
  return describeTaskLine(
    {
      title: 'title' in over ? over.title! : 'Send the press release',
      releaseTitle: 'releaseTitle' in over ? over.releaseTitle! : 'Midnight EP',
      artistName: 'artistName' in over ? over.artistName! : 'Dorian',
      dueDate: 'dueDate' in over ? over.dueDate! : day(0),
    },
    NOW,
  );
}

describe('describeTaskLine', () => {
  it('says the task, its rollout, artist and due state as one sentence', () => {
    expect(line({ dueDate: day(0) }).text).toBe('Send the press release in Midnight EP by Dorian, due today.');
    expect(line({ dueDate: day(1) }).text).toBe('Send the press release in Midnight EP by Dorian, due tomorrow.');
    expect(line({ dueDate: day(4) }).text).toBe('Send the press release in Midnight EP by Dorian, due in 4 days.');
  });

  it('folds the overdue statement into the same sentence and flags it', () => {
    const result = line({ dueDate: day(-3) });
    expect(result.text).toBe('Send the press release in Midnight EP by Dorian, 3 days overdue.');
    expect(result.isOverdue).toBe(true);
    expect(line({ dueDate: day(-1) }).text).toBe('Send the press release in Midnight EP by Dorian, 1 day overdue.');
  });

  it('splits into a title and the rest without changing the sentence', () => {
    const result = line({ dueDate: day(-3) });
    expect(result.title).toBe('Send the press release');
    expect(result.rest).toBe('in Midnight EP by Dorian, 3 days overdue.');
    expect(`${result.title}${result.joiner}${result.rest}`).toBe(result.text);
  });

  it('only flags a task that is actually overdue', () => {
    expect(line({ dueDate: day(0) }).isOverdue).toBe(false);
    expect(line({ dueDate: day(2) }).isOverdue).toBe(false);
    expect(line({ dueDate: null }).isOverdue).toBe(false);
  });

  it('handles a task with no due date', () => {
    expect(line({ dueDate: null }).text).toBe('Send the press release in Midnight EP by Dorian, no due date.');
  });

  it('leaves the artist out when there is none, never writing "Unassigned artist"', () => {
    expect(line({ artistName: null }).text).toBe('Send the press release in Midnight EP, due today.');
    expect(line({ artistName: '  ' }).text).toBe('Send the press release in Midnight EP, due today.');
  });

  it('says so when the task is not in a rollout', () => {
    expect(line({ releaseTitle: null }).text).toBe('Send the press release, not in a rollout, due today.');
    expect(line({ releaseTitle: null, dueDate: day(-2) }).text).toBe(
      'Send the press release, not in a rollout, 2 days overdue.',
    );
  });

  it('does not double up punctuation when the title already ends with some', () => {
    expect(line({ title: 'Send the press release.' }).text).toBe(
      'Send the press release in Midnight EP by Dorian, due today.',
    );
    expect(line({ title: '  Book the studio:  ' }).title).toBe('Book the studio');
  });

  it('is deterministic: the same task gives the same sentence', () => {
    expect(line({ dueDate: day(-5) })).toEqual(line({ dueDate: day(-5) }));
  });

  it('never uses the old separators or tag-style fragments', () => {
    const { text } = line({ dueDate: day(-3) });
    expect(text).not.toContain('·');
    expect(text.endsWith('.')).toBe(true);
  });

  it('never throws on a row with missing or non-string text (2026-10-09, Home crash)', () => {
    const odd = (over: Record<string, unknown>) =>
      describeTaskLine({ title: 'x', releaseTitle: null, artistName: null, dueDate: null, ...over } as never, NOW);
    expect(() => odd({ title: null })).not.toThrow();
    expect(() => odd({ title: undefined })).not.toThrow();
    expect(() => odd({ title: 42, releaseTitle: 7, artistName: {} })).not.toThrow();
    expect(() => odd({ dueDate: 'not a date' })).not.toThrow();
    expect(odd({ title: null }).text).toBe('Untitled activity, not in a rollout, no due date.');
    expect(odd({ title: '   ', releaseTitle: '  ' }).text).toBe('Untitled activity, not in a rollout, no due date.');
  });
});
