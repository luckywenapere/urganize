import { describe, expect, it } from 'vitest';
import {
  filterCatalogueRows,
  pickNextTask,
  progressPercent,
  sortCatalogueRows,
  statusCounts,
  statusGroup,
  type CatalogueRow,
} from './catalogue-table';

function row(over: Partial<CatalogueRow> & { id: string }): CatalogueRow {
  return {
    title: over.id,
    artistId: 'a1',
    artistName: 'Dorian',
    status: 'draft',
    releaseDate: null,
    tasksDone: 0,
    tasksTotal: 10,
    coverArtUrl: null,
    isTest: false,
    nextTask: null,
    ...over,
  };
}

const none = { query: '', artistId: null as string | null, status: 'all' as const };

describe('catalogue table', () => {
  it('groups statuses, and treats an unknown one as still being planned', () => {
    expect(statusGroup('draft')).toBe('planning');
    expect(statusGroup('planning')).toBe('planning');
    expect(statusGroup('in_progress')).toBe('active');
    expect(statusGroup('ready')).toBe('active');
    expect(statusGroup('released')).toBe('released');
    expect(statusGroup('archived')).toBe('archived');
    expect(statusGroup('something_new')).toBe('planning');
  });

  it('All hides archived rollouts, and the Archived chip shows only them', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', status: 'archived' })];
    expect(filterCatalogueRows(rows, none).map((r) => r.id)).toEqual(['a']);
    expect(filterCatalogueRows(rows, { ...none, status: 'archived' }).map((r) => r.id)).toEqual(['b']);
  });

  it('filters to the artist chosen in the top bar', () => {
    const rows = [row({ id: 'a', artistId: 'a1' }), row({ id: 'b', artistId: 'a2' })];
    expect(filterCatalogueRows(rows, { ...none, artistId: 'a2' }).map((r) => r.id)).toEqual(['b']);
    expect(filterCatalogueRows(rows, none).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('finds by title or artist and ignores word order', () => {
    const rows = [
      row({ id: 'a', title: 'Midnight EP', artistName: 'Dorian' }),
      row({ id: 'b', title: 'Lagos Nights', artistName: 'Tems' }),
    ];
    expect(filterCatalogueRows(rows, { ...none, query: 'ep midnight' }).map((r) => r.id)).toEqual(['a']);
    expect(filterCatalogueRows(rows, { ...none, query: 'tems' }).map((r) => r.id)).toEqual(['b']);
  });

  it('computes progress and never divides by zero', () => {
    expect(progressPercent({ tasksDone: 1, tasksTotal: 3 })).toBe(33);
    expect(progressPercent({ tasksDone: 0, tasksTotal: 0 })).toBe(0);
  });

  it('sorts by release date with undated last, and keeps ties in the incoming order', () => {
    const rows = [
      row({ id: 'none' }),
      row({ id: 'late', releaseDate: '2026-12-01' }),
      row({ id: 'soon', releaseDate: '2026-11-01' }),
      row({ id: 'soon2', releaseDate: '2026-11-01' }),
    ];
    expect(sortCatalogueRows(rows, 'date').map((r) => r.id)).toEqual(['soon', 'soon2', 'late', 'none']);
    expect(sortCatalogueRows(rows, 'recent')).toBe(rows);
  });

  it('sorts least done first', () => {
    const rows = [row({ id: 'most', tasksDone: 9 }), row({ id: 'least', tasksDone: 1 })];
    expect(sortCatalogueRows(rows, 'progress').map((r) => r.id)).toEqual(['least', 'most']);
  });

  it('counts each chip against the artist and search but not the chip itself', () => {
    const rows = [
      row({ id: 'a', status: 'draft' }),
      row({ id: 'b', status: 'in_progress' }),
      row({ id: 'c', status: 'released' }),
      row({ id: 'd', status: 'archived' }),
      row({ id: 'e', status: 'draft', artistId: 'other' }),
    ];
    const counts = statusCounts(rows, { query: '', artistId: 'a1' });
    expect(counts).toEqual({ all: 3, planning: 1, active: 1, released: 1, archived: 1 });
  });

  it('picks the soonest unfinished activity', () => {
    expect(pickNextTask([])).toBeNull();
    expect(pickNextTask([{ title: 'x', status: 'done', dueDate: '2026-01-01' }])).toBeNull();
    expect(
      pickNextTask([
        { title: 'undated', status: 'todo', dueDate: null },
        { title: 'later', status: 'todo', dueDate: '2026-11-10' },
        { title: 'sooner', status: 'in_progress', dueDate: '2026-11-02' },
        { title: 'done', status: 'done', dueDate: '2026-10-01' },
      ])
    ).toEqual({ title: 'sooner', dueDate: '2026-11-02' });
    expect(pickNextTask([{ title: 'only undated', status: 'todo', dueDate: null }])).toEqual({
      title: 'only undated',
      dueDate: null,
    });
  });
});
