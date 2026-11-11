import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_LAYOUT,
  addBlock,
  isDefaultLayout,
  layoutRows,
  moveBlock,
  readLayout,
  removeBlock,
  toPayload,
} from './layout';

describe('the default Home', () => {
  it('shows six blocks and keeps the ask box in "Add to Home"', () => {
    expect(DEFAULT_HOME_LAYOUT.order).toEqual(['out_now', 'next_drop', 'my_tasks', 'delegated', 'team', 'artists']);
    expect(DEFAULT_HOME_LAYOUT.removed).toEqual(['ask']);
  });
});

describe('readLayout (restore)', () => {
  it('gives the default for nothing, junk or an empty save', () => {
    for (const raw of [null, undefined, 'x', 7, {}, { order: 'no' }, { order: [] }]) {
      expect(readLayout(raw)).toEqual(DEFAULT_HOME_LAYOUT);
    }
  });

  it('restores exactly what was saved', () => {
    const saved = moveBlock(removeBlock(DEFAULT_HOME_LAYOUT, 'team'), 'artists', 0);
    expect(readLayout(toPayload(saved))).toEqual(saved);
    expect(readLayout(JSON.parse(JSON.stringify(toPayload(saved))))).toEqual(saved);
  });

  it('drops unknown and repeated blocks', () => {
    const layout = readLayout({ v: 1, order: ['artists', 'spend', 'artists', 'my_tasks'], removed: ['team', 'team', 'nope'] });
    expect(layout.order.filter((id) => id === 'artists')).toHaveLength(1);
    expect(layout.order).not.toContain('spend');
    expect(layout.removed.filter((id) => id === 'team')).toHaveLength(1);
  });

  it('always keeps Artists on Home, even if a save removed it', () => {
    const layout = readLayout({ v: 1, order: ['my_tasks'], removed: ['artists', 'out_now', 'next_drop', 'delegated', 'team', 'ask'] });
    expect(layout.order).toEqual(['my_tasks', 'artists']);
    expect(layout.removed).not.toContain('artists');
  });

  it('puts a block the save never heard of where the default has it', () => {
    // A save from before "team" existed: neither shown nor removed.
    const layout = readLayout({ v: 1, order: ['artists', 'my_tasks'], removed: ['out_now', 'next_drop', 'delegated', 'ask'] });
    expect(layout.order).toContain('team');
    expect(layout.removed).not.toContain('team');
    expect([...layout.order, ...layout.removed].sort()).toEqual(
      ['artists', 'ask', 'delegated', 'my_tasks', 'next_drop', 'out_now', 'team'].sort()
    );
  });
});

describe('editing', () => {
  it('moves a block and clamps the position', () => {
    expect(moveBlock(DEFAULT_HOME_LAYOUT, 'artists', 0).order[0]).toBe('artists');
    expect(moveBlock(DEFAULT_HOME_LAYOUT, 'out_now', 99).order.at(-1)).toBe('out_now');
    expect(moveBlock(DEFAULT_HOME_LAYOUT, 'out_now', -4).order[0]).toBe('out_now');
    expect(moveBlock(DEFAULT_HOME_LAYOUT, 'ask', 0)).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('removes a block into "Add to Home" and adds it back at the end', () => {
    const removed = removeBlock(DEFAULT_HOME_LAYOUT, 'team');
    expect(removed.order).not.toContain('team');
    expect(removed.removed).toEqual(['ask', 'team']);
    const added = addBlock(removed, 'team');
    expect(added.order.at(-1)).toBe('team');
    expect(added.removed).toEqual(['ask']);
  });

  it('never removes Artists', () => {
    expect(removeBlock(DEFAULT_HOME_LAYOUT, 'artists')).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('does not change the layout it was given', () => {
    const before = JSON.stringify(DEFAULT_HOME_LAYOUT);
    moveBlock(DEFAULT_HOME_LAYOUT, 'team', 0);
    removeBlock(DEFAULT_HOME_LAYOUT, 'team');
    addBlock(DEFAULT_HOME_LAYOUT, 'ask');
    expect(JSON.stringify(DEFAULT_HOME_LAYOUT)).toBe(before);
  });

  it('knows when a layout is the default again', () => {
    expect(isDefaultLayout(DEFAULT_HOME_LAYOUT)).toBe(true);
    expect(isDefaultLayout(addBlock(removeBlock(DEFAULT_HOME_LAYOUT, 'artists'), 'ask'))).toBe(false);
    expect(isDefaultLayout(readLayout(null))).toBe(true);
  });
});

describe('layoutRows', () => {
  it('sits the two task lists side by side when they are neighbours', () => {
    expect(layoutRows(DEFAULT_HOME_LAYOUT.order)).toEqual([
      ['out_now'],
      ['next_drop'],
      ['my_tasks', 'delegated'],
      ['team'],
      ['artists'],
    ]);
    expect(layoutRows(['delegated', 'my_tasks', 'artists'])).toEqual([['delegated', 'my_tasks'], ['artists']]);
  });

  it('gives a task list the full width when it stands alone', () => {
    expect(layoutRows(['my_tasks', 'artists', 'delegated'])).toEqual([['my_tasks'], ['artists'], ['delegated']]);
  });
});
