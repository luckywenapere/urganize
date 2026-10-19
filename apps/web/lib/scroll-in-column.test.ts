import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { columnScrollTop } from './scroll-in-column';

describe('columnScrollTop (URG-380 hotfix)', () => {
  const base = { elementHeight: 40, scrollerTop: 100, scrollerHeight: 600, currentScrollTop: 200 };
  it('end puts the element at the bottom of the scroller', () => {
    expect(columnScrollTop({ ...base, elementTop: 900, block: 'end' })).toBe(900 - 100 + 200 - 600 + 40);
  });
  it('start and center', () => {
    expect(columnScrollTop({ ...base, elementTop: 300, block: 'start' })).toBe(400);
    expect(columnScrollTop({ ...base, elementTop: 300, block: 'center' })).toBe(400 - 280);
  });
  it('never goes negative', () => {
    expect(columnScrollTop({ ...base, elementTop: 0, currentScrollTop: 0, block: 'end' })).toBe(0);
  });
});

describe('swipe panes never scroll sideways', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('nothing inside a swipe pane calls scrollIntoView', () => {
    for (const file of [
      'components/shell/swipe/UrgAnsPane.tsx',
      'components/chappi/ChappiConversation.tsx',
      'components/shell/swipe/SwipePager.tsx',
    ]) {
      expect(read(file)).not.toMatch(/\.scrollIntoView\(/);
    }
  });
  it('panes are exactly one viewport wide and clip sideways overflow', () => {
    const pager = read('components/shell/swipe/SwipePager.tsx');
    expect(pager).toMatch(/flex: `0 0 \$\{100 \/ COUNT\}%`/);
    expect(pager).toMatch(/overflow-x-hidden/);
    expect(pager).toMatch(/overflow: 'clip'/);
    expect(pager).toMatch(/addEventListener\('resize', resettle\)/);
  });
});
