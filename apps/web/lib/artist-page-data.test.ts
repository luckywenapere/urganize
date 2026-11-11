import { describe, expect, it } from 'vitest';
import { artistTaskList, olderSongsNotRolledOut, recordsStillInTheMaking } from './artist-page-data';

describe('recordsStillInTheMaking: a record shows once (#1183)', () => {
  const record = (id: string, releaseId: string | null = null) => ({ id, releaseId });

  it('keeps a record that has no rollout', () => {
    expect(recordsStillInTheMaking([record('a')], ['r1']).map((r) => r.id)).toEqual(['a']);
  });

  it('drops a record whose rollout is already on the page', () => {
    expect(recordsStillInTheMaking([record('a', 'r1'), record('b')], ['r1']).map((r) => r.id)).toEqual(['b']);
  });

  it('keeps a record pointing at a rollout the page does not show', () => {
    // The rollout was deleted or belongs elsewhere: hiding the record would lose it.
    expect(recordsStillInTheMaking([record('a', 'gone')], ['r1']).map((r) => r.id)).toEqual(['a']);
  });

  it('reads a record with no releaseId field as unlinked', () => {
    const bare: { id: string; releaseId?: string | null }[] = [{ id: 'a' }];
    expect(recordsStillInTheMaking(bare, ['r1'])).toHaveLength(1);
  });
});

describe('olderSongsNotRolledOut: a song out through a rollout is not listed again (#1183)', () => {
  const song = (title: string, release_date: string | null) => ({ title, release_date });
  const out = (title: string, releaseDate: string | null) => ({ title, releaseDate });

  it('drops the streaming copy of a song a rollout already put out', () => {
    const rows = olderSongsNotRolledOut([song('Blessings', '2026-11-07'), song('Old One', '2021-03-01')], [out('Blessings', '2026-11-07')]);
    expect(rows.map((r) => r.title)).toEqual(['Old One']);
  });

  it('ignores case, accents, punctuation and extra spaces in the title', () => {
    expect(olderSongsNotRolledOut([song('  Golden  hour! ', '2026-10-14')], [out('Golden Hour', '2026-10-14')])).toEqual([]);
    expect(olderSongsNotRolledOut([song('Ọwámbẹ̀ Season', '2026-10-14')], [out('Owambe Season', '2026-10-15')])).toEqual([]);
  });

  it('allows the store date to differ from the planned date by up to 60 days', () => {
    expect(olderSongsNotRolledOut([song('Blessings', '2026-09-10')], [out('Blessings', '2026-11-07')])).toEqual([]);
    expect(olderSongsNotRolledOut([song('Blessings', '2026-09-07')], [out('Blessings', '2026-11-07')])).toHaveLength(1);
  });

  it('keeps an old song that only shares its name with a new rollout', () => {
    expect(olderSongsNotRolledOut([song('Blessings', '2019-05-01')], [out('Blessings', '2026-11-07')])).toHaveLength(1);
  });

  it('matches on the title alone when either side has no date', () => {
    expect(olderSongsNotRolledOut([song('Blessings', null)], [out('Blessings', '2026-11-07')])).toEqual([]);
    expect(olderSongsNotRolledOut([song('Blessings', '2026-11-07')], [out('Blessings', null)])).toEqual([]);
  });

  it('never matches an empty title', () => {
    expect(olderSongsNotRolledOut([song(' ', null)], [out('', null)])).toHaveLength(1);
  });
});

describe('artistTaskList: the tasks card on the artist page (#1183)', () => {
  const TODAY = '2026-11-10';
  const task = (
    id: string,
    dueDate: string | null,
    over: Partial<{ releaseId: string | null; status: string; assignedToUserId: string | null }> = {}
  ) => ({ id, releaseId: 'r1', status: 'todo', dueDate, assignedToUserId: null, ...over });
  const list = (tasks: ReturnType<typeof task>[], limit?: number) =>
    artistTaskList({ tasks, releaseIds: ['r1', 'r2'], today: TODAY, viewerId: 'me', limit });

  it('puts late tasks first, most late first, then the soonest, then undated', () => {
    const result = list([task('nodate', null), task('soon', '2026-11-12'), task('late1', '2026-11-09'), task('later', '2026-12-01'), task('late4', '2026-11-06')]);
    expect(result.rows.map((row) => row.task.id)).toEqual(['late4', 'late1', 'soon', 'later', 'nodate']);
  });

  it('keeps the order given for tasks due the same day', () => {
    const result = list([task('a', '2026-11-12'), task('b', '2026-11-12')]);
    expect(result.rows.map((row) => row.task.id)).toEqual(['a', 'b']);
  });

  it('shows five by default and counts every open task', () => {
    const many = Array.from({ length: 8 }, (_, i) => task(`t${i}`, `2026-11-${String(11 + i).padStart(2, '0')}`));
    const result = list(many);
    expect(result.rows).toHaveLength(5);
    expect(result.open).toBe(8);
    expect(list(many, 4).rows).toHaveLength(4);
  });

  it('leaves out done and cancelled tasks, and tasks on other rollouts or none', () => {
    const result = list([
      task('done', '2026-11-01', { status: 'done' }),
      task('cancelled', '2026-11-01', { status: 'cancelled' }),
      task('other', '2026-11-01', { releaseId: 'someone-else' }),
      task('loose', '2026-11-01', { releaseId: null }),
      task('mine', '2026-11-11', { releaseId: 'r2' }),
    ]);
    expect(result.rows.map((row) => row.task.id)).toEqual(['mine']);
    expect(result).toMatchObject({ open: 1, late: 0, dueThisWeek: 1 });
  });

  it('counts late and due this week the way Up next does: today counts, day seven does not', () => {
    const result = list([
      task('late', '2026-11-09'),
      task('today', '2026-11-10'),
      task('day6', '2026-11-16'),
      task('day7', '2026-11-17'),
      task('nodate', null),
    ]);
    expect(result).toMatchObject({ late: 1, dueThisWeek: 2, open: 5 });
  });

  it('says how late or when each one is due', () => {
    const result = list([task('a', '2026-11-06'), task('b', '2026-11-09'), task('c', '2026-11-10'), task('d', '2026-11-16'), task('e', null)]);
    expect(result.rows.map((row) => [row.dueLabel, row.late])).toEqual([
      ['4 days late', true],
      ['1 day late', true],
      ['Today', false],
      ['Mon 16 Nov', false],
      ['No date', false],
    ]);
  });

  it('reads a timestamp due date by its day', () => {
    expect(list([task('a', '2026-11-09T23:30:00.000Z')]).rows[0].dueLabel).toBe('1 day late');
  });

  it("says whose each task is: the viewer's, a teammate's, or nobody's", () => {
    const result = list([
      task('mine', '2026-11-11', { assignedToUserId: 'me' }),
      task('theirs', '2026-11-12', { assignedToUserId: 'ada' }),
      task('open', '2026-11-13'),
    ]);
    expect(result.rows.map((row) => row.owner)).toEqual(['viewer', 'other', 'nobody']);
  });

  it('counts a task given to someone invited who has not joined yet as a teammate’s', () => {
    const invited = { ...task('a', '2026-11-11'), assignedTo: 'member-row-id' };
    expect(artistTaskList({ tasks: [invited], releaseIds: ['r1'], today: TODAY, viewerId: 'me' }).rows[0].owner).toBe('other');
  });

  it('never calls a task the viewer’s own when nobody is signed in', () => {
    const result = artistTaskList({ tasks: [task('a', null)], releaseIds: ['r1'], today: TODAY, viewerId: null });
    expect(result.rows[0].owner).toBe('nobody');
  });

  it('is empty, with zero counts, when there is nothing open', () => {
    expect(list([])).toEqual({ rows: [], open: 0, late: 0, dueThisWeek: 0 });
  });
});
