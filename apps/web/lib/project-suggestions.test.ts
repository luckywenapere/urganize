import { describe, expect, it } from 'vitest';
import { suggestProjectTasks, IDEA_STAGE_SUGGESTIONS } from './project-suggestions';

describe('suggestProjectTasks', () => {
  it('an idea gets the idea-stage list', () => {
    const out = suggestProjectTasks({ status: 'idea', songs: [], existingTitles: [] });
    expect(out.map((s) => s.title)).toEqual(IDEA_STAGE_SUGGESTIONS.slice(0, 4).map((s) => s.title));
  });

  it('making leads with one finish job per song still being made', () => {
    const out = suggestProjectTasks({
      status: 'making',
      songs: [
        { title: 'Wahala', stage: 'mixing' },
        { title: 'Pressure', stage: 'recording' },
        { title: 'Done One', stage: 'done' },
        { title: 'Later', stage: 'idea' },
      ],
      existingTitles: [],
    });
    expect(out.slice(0, 2).map((s) => s.title)).toEqual(['Finish the Wahala mix', 'Finish recording Pressure']);
    expect(out.map((s) => s.title)).not.toContain('Finish writing Later');
  });

  it('making with no songs falls back to the pre-production jobs', () => {
    const out = suggestProjectTasks({ status: 'making', songs: [], existingTitles: [] });
    expect(out[0].title).toBe('Book sessions');
  });

  it('drops "Finish the song" once songs carry their own finish jobs', () => {
    const out = suggestProjectTasks({
      status: 'making',
      songs: [{ title: 'Wahala', stage: 'mixing' }],
      existingTitles: [],
      limit: 20,
    });
    expect(out.map((s) => s.title)).not.toContain('Finish the song');
  });

  it('hides a job already added, whatever its case or spacing', () => {
    const out = suggestProjectTasks({
      status: 'idea',
      songs: [],
      existingTitles: ['  write the HOOK '],
      limit: 20,
    });
    expect(out.map((s) => s.title)).not.toContain('Write the hook');
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
