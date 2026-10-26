import { describe, expect, it } from 'vitest';
import {
  MAX_IDEA_ADDS,
  MAX_IDEA_MOVES,
  buildIdeaChangesMessages,
  changeWindow,
  cleanIdeaChanges,
  readApplyBody,
  readIdeaChanges,
  viewIdeaChanges,
  whenWords,
  type ChangeTask,
} from './rollout-idea-changes';

const dated = { releaseDate: '2026-12-01', todayYmd: '2026-11-01' }; // today = day -30
const undated = { releaseDate: null, todayYmd: '2026-11-01' };

function task(over: Partial<ChangeTask> & { id: string; title: string }): ChangeTask {
  return { status: 'todo', offsetDays: -20, ...over };
}

const board: ChangeTask[] = [
  task({ id: 'a', title: 'Write his short bio', offsetDays: -21 }),
  task({ id: 'b', title: 'Plan the first announcement', offsetDays: -14 }),
  task({ id: 'c', title: 'Send the master to the distributor', status: 'done', offsetDays: -25 }),
];

describe('changeWindow', () => {
  it('never starts before today on a dated rollout, and is relative on an undated one', () => {
    expect(changeWindow(dated).min).toBe(-30);
    expect(changeWindow(undated)).toEqual({ min: -56, max: 42 });
  });
});

describe('whenWords', () => {
  it('writes a date for a dated rollout and a relative phrase otherwise', () => {
    expect(whenWords(dated, -14)).toBe('Nov 17');
    expect(whenWords(undated, -28)).toBe('4 weeks before');
    expect(whenWords(undated, 0, true)).toBe('Now');
    expect(whenWords(dated, null)).toBe('No date');
  });
});

describe('readIdeaChanges', () => {
  it('maps task keys to ids, drops unknown keys, and holds adds to the rules', () => {
    const changes = readIdeaChanges(
      JSON.stringify({
        adds: [
          { title: 'Book a venue for the listening party', why: 'Gives the idea a place', offset_days: -10, now: false },
          { title: 'Write his short bio', why: 'duplicate', offset_days: -5, now: false },
          { title: 'Invite press — and early fans', why: 'x', offset_days: -90, now: false },
        ],
        moves: [
          { task: 't2', offset_days: -20 },
          { task: 't99', offset_days: -20 },
          { task: 't3', offset_days: -20 },
        ],
      }),
      dated,
      board
    );
    expect(changes?.adds.map((a) => a.title)).toEqual([
      'Book a venue for the listening party',
      'Invite press , and early fans',
    ]);
    // Before today is pulled up to today (day -30), not dropped.
    expect(changes?.adds[1].offsetDays).toBe(-30);
    // t99 is not on the board; t3 is done.
    expect(changes?.moves).toEqual([{ taskId: 'b', offsetDays: -20 }]);
  });

  it('returns null for an unusable answer', () => {
    expect(readIdeaChanges('nope', dated, board)).toBeNull();
    expect(readIdeaChanges({ foo: 1 }, dated, board)).toBeNull();
    expect(readIdeaChanges({ adds: [], moves: [] }, dated, board)).toEqual({ adds: [], moves: [] });
  });
});

describe('cleanIdeaChanges', () => {
  it('caps the lists, skips a move to the same time, and never moves a task twice', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      title: `Distinct action number ${i} with unique words ${'abcdefghi'[i]}${i}`,
      why: '',
      offsetDays: -5,
      now: false,
    }));
    const cleaned = cleanIdeaChanges(
      {
        adds: many,
        moves: [
          { taskId: 'a', offsetDays: -21 },
          { taskId: 'b', offsetDays: -12 },
          { taskId: 'b', offsetDays: -11 },
        ],
      },
      undated,
      board
    );
    expect(cleaned.adds).toHaveLength(MAX_IDEA_ADDS);
    expect(cleaned.moves).toEqual([{ taskId: 'b', offsetDays: -12 }]);
    expect(cleaned.moves.length).toBeLessThanOrEqual(MAX_IDEA_MOVES);
  });
});

describe('readApplyBody', () => {
  it('reads the browser body and turns garbage into empty lists', () => {
    expect(readApplyBody(null)).toEqual({ adds: [], moves: [] });
    expect(
      readApplyBody({
        adds: [{ title: 'A', why: 'b', offsetDays: '3', now: true }, { title: 'bad', offsetDays: 'x' }],
        moves: [{ taskId: 'a', offsetDays: 2 }, { taskId: 5, offsetDays: 2 }],
      })
    ).toEqual({ adds: [{ title: 'A', why: 'b', offsetDays: 3, now: true }], moves: [{ taskId: 'a', offsetDays: 2 }] });
  });
});

describe('viewIdeaChanges and the prompt', () => {
  it('words each timing, and the prompt lists tasks by key, not id', () => {
    const view = viewIdeaChanges(
      { adds: [{ title: 'New', why: '', offsetDays: -7, now: false }], moves: [{ taskId: 'b', offsetDays: -20 }] },
      dated,
      board
    );
    expect(view.adds[0].when).toBe('Nov 24');
    expect(view.moves[0]).toMatchObject({ title: 'Plan the first announcement', fromWhen: 'Nov 17', when: 'Nov 11' });
    const [system, user] = buildIdeaChangesMessages({
      title: 'Debut',
      artistName: 'Tosin',
      releaseType: 'single',
      idea: 'listening party in Lagos',
      tasks: board,
      ctx: dated,
    });
    expect(system.content).toContain('Never remove or rewrite a task');
    expect(user.content).toContain('listening party in Lagos');
    expect(user.content).toContain('t2: Plan the first announcement');
    expect(user.content).not.toContain('"b"');
  });
});
