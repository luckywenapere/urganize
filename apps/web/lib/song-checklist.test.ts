import { describe, expect, it } from 'vitest';
import {
  SONG_CHECKLIST,
  SONG_CHECKLIST_SIZE,
  checklistSeedRows,
  furthestSongStage,
  groupProjectTasks,
  hasSongChecklist,
} from './song-checklist';

const task = (title: string, status = 'todo', id = title) => ({ id, title, status });

describe('SONG_CHECKLIST', () => {
  it('is 15 tasks in four groups, in order', () => {
    expect(SONG_CHECKLIST.map((group) => group.label)).toEqual(['Idea', 'Recording', 'Finishing', 'Paperwork']);
    expect(SONG_CHECKLIST.map((group) => group.items.length)).toEqual([3, 4, 4, 4]);
    expect(SONG_CHECKLIST_SIZE).toBe(15);
  });

  it('has unique keys and unique titles', () => {
    const items = SONG_CHECKLIST.flatMap((group) => group.items);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.title.toLowerCase())).size).toBe(items.length);
  });

  it('no title has a dash or a comma before "and"', () => {
    for (const item of SONG_CHECKLIST.flatMap((group) => group.items)) {
      expect(item.title).not.toMatch(/[—–]/);
      expect(`${item.title} ${item.description ?? ''}`).not.toMatch(/, and /);
    }
  });
});

describe('furthestSongStage', () => {
  it('is idea with no songs', () => {
    expect(furthestSongStage([])).toBe('idea');
  });

  it('is the furthest song, not the first', () => {
    expect(furthestSongStage([{ stage: 'idea' }, { stage: 'mixing' }, { stage: 'recording' }])).toBe('mixing');
  });
});

describe('checklistSeedRows', () => {
  it('an idea gets all 15 open, in checklist order', () => {
    const rows = checklistSeedRows({ stage: 'idea', existingTitles: [] });
    expect(rows).toHaveLength(15);
    expect(rows.every((row) => row.status === 'todo')).toBe(true);
    expect(rows[0].title).toBe(SONG_CHECKLIST[0].items[0].title);
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index));
  });

  it('a song at mixing has Idea and Recording ticked, the rest open', () => {
    const rows = checklistSeedRows({ stage: 'mixing', existingTitles: [] });
    const done = rows.filter((row) => row.status === 'done').map((row) => row.group);
    expect(new Set(done)).toEqual(new Set(['idea', 'recording']));
    expect(done).toHaveLength(7);
  });

  it('a finished song has everything but Paperwork ticked', () => {
    const rows = checklistSeedRows({ stage: 'done', existingTitles: [] });
    expect(rows.filter((row) => row.status === 'todo').every((row) => row.group === 'paperwork')).toBe(true);
  });

  it('never adds a task the project already has, whatever the case or spacing', () => {
    const rows = checklistSeedRows({ stage: 'idea', existingTitles: ['  write THE hook '] });
    expect(rows).toHaveLength(14);
    expect(rows.map((row) => row.title)).not.toContain('Write the hook');
  });

  it('adds nothing once the whole checklist is there', () => {
    const all = SONG_CHECKLIST.flatMap((group) => group.items.map((item) => item.title));
    expect(checklistSeedRows({ stage: 'idea', existingTitles: all })).toEqual([]);
  });
});

describe('groupProjectTasks', () => {
  it('sorts checklist tasks into their groups in checklist order and counts them', () => {
    const idea = SONG_CHECKLIST[0].items;
    const out = groupProjectTasks([task(idea[2].title), task(idea[0].title, 'done'), task(idea[1].title)]);
    expect(out.groups[0].tasks.map((row) => row.title)).toEqual(idea.map((item) => item.title));
    expect(out.groups[0]).toMatchObject({ key: 'idea', done: 1, total: 3 });
    expect(out.done).toBe(1);
    expect(out.total).toBe(3);
  });

  it('puts tasks the team added themselves under other, in the order given', () => {
    const out = groupProjectTasks([task('Call the radio plug'), task(SONG_CHECKLIST[1].items[0].title), task('Buy strings')]);
    expect(out.other.map((row) => row.title)).toEqual(['Call the radio plug', 'Buy strings']);
    expect(out.total).toBe(3);
  });

  it('counts cancelled tasks as closed, like the rest of the app', () => {
    const out = groupProjectTasks([task(SONG_CHECKLIST[0].items[0].title, 'cancelled')]);
    expect(out.groups[0].done).toBe(1);
  });

  it('leaves out a group with no tasks, so a deleted group does not come back empty', () => {
    const out = groupProjectTasks([task(SONG_CHECKLIST[3].items[0].title)]);
    expect(out.groups.map((group) => group.key)).toEqual(['paperwork']);
  });
});

describe('hasSongChecklist', () => {
  it('is false for a project made before the checklist', () => {
    expect(hasSongChecklist([task('Book sessions')])).toBe(false);
  });

  it('is true once any checklist task is there', () => {
    expect(hasSongChecklist([task(SONG_CHECKLIST[2].items[1].title)])).toBe(true);
  });
});
