import { describe, expect, it } from 'vitest';

import {
  EMPTY_CHECKLIST_RECORD,
  buildChecklist,
  checklistKey,
  checklistProgressLabel,
  isChecklistRecord,
  reconcileChecklist,
  toggleChecklistTick,
  type ChecklistRecord,
} from './distribution-checklist';
import type { DistributionIssue } from './distribution-rules';

const genre: DistributionIssue = { code: 'missing_genre', fieldPath: 'metadata.genre', message: 'Add a genre.' };
const art: DistributionIssue = { code: 'artwork_missing', fieldPath: 'artwork', message: 'Add cover art.' };
const caps: DistributionIssue = { code: 'title_all_caps', fieldPath: 'title', message: 'The title is all caps.' };

function seed(errors: DistributionIssue[], warnings: DistributionIssue[] = []): ChecklistRecord {
  return reconcileChecklist(EMPTY_CHECKLIST_RECORD, { errors, warnings }).record;
}

describe('reconcileChecklist', () => {
  it('records every item the first read raises and reports nothing as fixed', () => {
    const { record, newlyFixed } = reconcileChecklist(EMPTY_CHECKLIST_RECORD, {
      errors: [genre, art],
      warnings: [caps],
    });
    expect(record.entries.map((entry) => entry.key)).toEqual([
      checklistKey(genre),
      checklistKey(art),
      checklistKey(caps),
    ]);
    expect(newlyFixed).toEqual([]);
  });

  it('reports an item as fixed the first read it stops appearing, and only once', () => {
    const first = seed([genre, art]);
    const second = reconcileChecklist(first, { errors: [art], warnings: [] });
    expect(second.newlyFixed.map((entry) => entry.code)).toEqual(['missing_genre']);
    const third = reconcileChecklist(second.record, { errors: [art], warnings: [] });
    expect(third.newlyFixed).toEqual([]);
  });

  it('reopens an error that comes back after being fixed', () => {
    const fixed = reconcileChecklist(seed([genre]), { errors: [], warnings: [] }).record;
    expect(fixed.fixed).toEqual([checklistKey(genre)]);
    const back = reconcileChecklist(fixed, { errors: [genre], warnings: [] }).record;
    expect(back.fixed).toEqual([]);
    expect(buildChecklist(back, { errors: [genre], warnings: [] }).doneCount).toBe(0);
  });

  it('keeps one row per rule and field while the wording changes', () => {
    const first = seed([genre]);
    const reworded = { ...genre, message: 'Pick a genre for the song.' };
    const { record } = reconcileChecklist(first, { errors: [reworded], warnings: [] });
    expect(record.entries).toHaveLength(1);
    expect(record.entries[0].message).toBe('Pick a genre for the song.');
  });

  it('does not report a warning ticked by hand as fixed when it later disappears', () => {
    const ticked = toggleChecklistTick(seed([], [caps]), checklistKey(caps))!.record;
    const { newlyFixed } = reconcileChecklist(ticked, { errors: [], warnings: [] });
    expect(newlyFixed).toEqual([]);
  });
});

describe('toggleChecklistTick', () => {
  it('ticks and unticks an open warning', () => {
    const record = seed([], [caps]);
    const on = toggleChecklistTick(record, checklistKey(caps));
    expect(on?.ticked).toBe(true);
    const off = toggleChecklistTick(on!.record, checklistKey(caps));
    expect(off?.ticked).toBe(false);
    expect(off?.record.ticked).toEqual([]);
  });

  it('refuses to tick an error, since the distributor would still refuse it', () => {
    expect(toggleChecklistTick(seed([genre]), checklistKey(genre))).toBeNull();
  });

  it('refuses an unknown key', () => {
    expect(toggleChecklistTick(seed([genre]), 'nope:title')).toBeNull();
  });
});

describe('buildChecklist', () => {
  it('counts done items and puts open errors, then open warnings, then done items', () => {
    const record = reconcileChecklist(seed([genre, art], [caps]), { errors: [art], warnings: [caps] }).record;
    const list = buildChecklist(record, { errors: [art], warnings: [caps] });
    expect(list.items.map((item) => [item.code, item.done])).toEqual([
      ['artwork_missing', false],
      ['title_all_caps', false],
      ['missing_genre', true],
    ]);
    expect(checklistProgressLabel(list)).toBe('1 of 3 done');
  });

  it('lets only open warnings be ticked, and gives open items their live issue for the Fix button', () => {
    const list = buildChecklist(seed([genre], [caps]), { errors: [genre], warnings: [caps] });
    const byCode = Object.fromEntries(list.items.map((item) => [item.code, item]));
    expect(byCode.missing_genre.canTick).toBe(false);
    expect(byCode.missing_genre.issue).toEqual(genre);
    expect(byCode.title_all_caps.canTick).toBe(true);
  });

  it('marks a ticked warning done by hand', () => {
    const record = toggleChecklistTick(seed([], [caps]), checklistKey(caps))!.record;
    const [item] = buildChecklist(record, { errors: [], warnings: [caps] }).items;
    expect(item.done).toBe(true);
    expect(item.doneBy).toBe('ticked');
  });
});

describe('isChecklistRecord', () => {
  it('accepts a real record and rejects junk', () => {
    expect(isChecklistRecord(seed([genre], [caps]))).toBe(true);
    expect(isChecklistRecord(EMPTY_CHECKLIST_RECORD)).toBe(true);
    expect(isChecklistRecord(null)).toBe(false);
    expect(isChecklistRecord({ entries: [{ key: 1 }], ticked: [], fixed: [] })).toBe(false);
    expect(isChecklistRecord({ entries: [], ticked: 'x', fixed: [] })).toBe(false);
  });
});
