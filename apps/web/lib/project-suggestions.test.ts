import { describe, expect, it } from 'vitest';
import { suggestProjectTasks } from './project-suggestions';
import { SONG_CHECKLIST } from './song-checklist';

const checklistTitles = SONG_CHECKLIST.flatMap((group) => group.items.map((item) => item.title));

describe('suggestProjectTasks', () => {
  it('an idea gets the song checklist, in order', () => {
    const out = suggestProjectTasks({ status: 'idea', songs: [], existingTitles: [] });
    expect(out.map((s) => s.title)).toEqual(checklistTitles.slice(0, 4));
  });

  it('making leads with one finish job per song still being made, then the checklist', () => {
    const out = suggestProjectTasks({
      status: 'making',
      songs: [
        { title: 'Wahala', stage: 'mixing' },
        { title: 'Pressure', stage: 'recording' },
        { title: 'Done One', stage: 'done' },
        { title: 'Later', stage: 'idea' },
      ],
      existingTitles: [],
      limit: 3,
    });
    expect(out.map((s) => s.title)).toEqual(['Finish the Wahala mix', 'Finish recording Pressure', checklistTitles[0]]);
  });

  it('only offers checklist tasks the project does not have, whatever their case or spacing', () => {
    const out = suggestProjectTasks({
      status: 'making',
      songs: [],
      existingTitles: ['  write the HOOK ', checklistTitles[1]],
      limit: 50,
    });
    expect(out.map((s) => s.title)).toEqual(checklistTitles.slice(2));
  });

  it('offers nothing once the whole checklist is on the project and no song is mid-way', () => {
    expect(suggestProjectTasks({ status: 'making', songs: [], existingTitles: checklistTitles })).toEqual([]);
  });

  it('a planned or dropped project suggests nothing', () => {
    expect(suggestProjectTasks({ status: 'planned', songs: [], existingTitles: [] })).toEqual([]);
    expect(suggestProjectTasks({ status: 'dropped', songs: [], existingTitles: [] })).toEqual([]);
  });

  it('keys are stable and unique', () => {
    const out = suggestProjectTasks({
      status: 'making',
      songs: [{ title: 'A', stage: 'mixing' }, { title: 'B', stage: 'mixing' }],
      existingTitles: [],
      limit: 50,
    });
    expect(new Set(out.map((s) => s.key)).size).toBe(out.length);
  });

  it('respects the limit', () => {
    expect(suggestProjectTasks({ status: 'making', songs: [], existingTitles: [], limit: 2 })).toHaveLength(2);
  });
});
