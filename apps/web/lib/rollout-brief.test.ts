import { describe, expect, it } from 'vitest';
import {
  MAX_BRIEF_GOAL_LENGTH,
  MAX_BRIEF_MOVES,
  briefFingerprint,
  buildBriefMessages,
  missingItems,
  nextUp,
  parseBrief,
  readStoredBrief,
  type BriefTask,
} from './rollout-brief';

function task(over: Partial<BriefTask> & { title: string }): BriefTask {
  return { status: 'todo', dueDate: null, position: 0, assignedTo: null, ...over };
}

describe('nextUp', () => {
  it('skips done, cancelled and milestone tasks, earliest due first, undated in plan order', () => {
    const items = nextUp([
      task({ title: 'Undated late', position: 5 }),
      task({ title: 'Done', status: 'done', dueDate: '2026-01-01' }),
      task({ title: 'Milestone', taskType: 'event_milestone', dueDate: '2026-01-02' }),
      task({ title: 'Due later', dueDate: '2026-03-01', assignedTo: 'Tosin' }),
      task({ title: 'Due first', dueDate: '2026-02-01' }),
      task({ title: 'Undated early', position: 1 }),
    ]);
    expect(items.map((item) => item.title)).toEqual(['Due first', 'Due later', 'Undated early']);
    expect(items[1].owner).toBe('Tosin');
    expect(items[0].owner).toBeNull();
  });
});

describe('missingItems', () => {
  it('names the date and unassigned work, and nothing when all is set', () => {
    expect(missingItems({ hasReleaseDate: false, next: [{ title: 'A', owner: null }] })).toEqual([
      'A release date (it sets the timeline)',
      'An owner for "A"',
    ]);
    expect(
      missingItems({
        hasReleaseDate: false,
        next: [
          { title: 'A', owner: null },
          { title: 'B', owner: null },
          { title: 'C', owner: 'Tosin' },
        ],
      })
    ).toContain('Owners for 2 of the next tasks');
    expect(missingItems({ hasReleaseDate: true, next: [{ title: 'A', owner: 'Tosin' }] })).toEqual([]);
  });
});

describe('briefFingerprint', () => {
  it('changes with the notes or the task titles, not their order', () => {
    const base = briefFingerprint({ notes: ['idea'], taskTitles: ['a', 'b'] });
    expect(briefFingerprint({ notes: ['idea'], taskTitles: ['b', 'a'] })).toBe(base);
    expect(briefFingerprint({ notes: ['idea 2'], taskTitles: ['a', 'b'] })).not.toBe(base);
    expect(briefFingerprint({ notes: ['idea'], taskTitles: ['a', 'b', 'c'] })).not.toBe(base);
  });
});

describe('parseBrief', () => {
  it('reads fenced JSON, caps moves and lengths, and drops em dashes', () => {
    const brief = parseBrief(
      '```json\n' +
        JSON.stringify({ goal: 'Introduce him — before the music', moves: ['a', 'b', 'c', 'd', ''] }) +
        '\n```'
    );
    expect(brief?.goal).toBe('Introduce him , before the music');
    expect(brief?.moves).toHaveLength(MAX_BRIEF_MOVES);
    expect(parseBrief(JSON.stringify({ goal: 'x'.repeat(500), moves: [] }))?.goal.length).toBeLessThanOrEqual(
      MAX_BRIEF_GOAL_LENGTH
    );
  });

  it('returns null for anything unusable', () => {
    expect(parseBrief('not json')).toBeNull();
    expect(parseBrief('{"moves":["a"]}')).toBeNull();
    expect(readStoredBrief(null)).toBeNull();
    expect(readStoredBrief({ goal: 'Fine', moves: ['one'] })).toEqual({ goal: 'Fine', moves: ['one'] });
  });
});

describe('buildBriefMessages', () => {
  it('carries the idea and the plan tasks, and says what to return', () => {
    const [system, user] = buildBriefMessages({
      title: 'Debut',
      artistName: 'Tosin',
      releaseType: 'single',
      notes: [{ author: 'Wena', content: 'announce him first' }],
      taskTitles: ['Write bio'],
    });
    expect(system.content).toContain('"goal"');
    expect(user.content).toContain('Wena: announce him first');
    expect(user.content).toContain('- Write bio');
  });
});
