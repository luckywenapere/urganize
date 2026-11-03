import { describe, expect, it } from 'vitest';
import { HOME_BLOCK_LABELS, orderHomeBlocks, type HomeBlocksInput } from './sections';

const full: HomeBlocksInput = {
  onboardingVisible: true,
  taskCount: 5,
  upNext: 'release',
  attentionCount: 2,
  waitingCount: 3,
  rolloutCount: 2,
  placementCount: 4,
  showSpend: true,
  lateCount: 0,
};

describe('orderHomeBlocks', () => {
  it('puts every non-empty group in the decided order', () => {
    expect(orderHomeBlocks(full)).toEqual([
      'onboarding',
      'tasks',
      'attention',
      'waiting',
      'rollouts',
      'placements',
      'spend',
      'daily-line',
    ]);
  });

  it('puts Next moves straight after the tasks, only when there are some (URG-259)', () => {
    const blocks = orderHomeBlocks({ ...full, nextMoveCount: 2 });
    expect(blocks.slice(0, 4)).toEqual(['onboarding', 'tasks', 'next-moves', 'attention']);
    expect(orderHomeBlocks({ ...full, nextMoveCount: 0 })).not.toContain('next-moves');
    expect(orderHomeBlocks({ ...full, taskCount: 0, nextMoveCount: 1 }).slice(1, 3)).toEqual(['up-next', 'next-moves']);
    expect(HOME_BLOCK_LABELS['next-moves']).toBe('Next moves');
  });

  it('leaves out every group with nothing in it', () => {
    expect(
      orderHomeBlocks({
        ...full,
        onboardingVisible: false,
        attentionCount: 0,
        waitingCount: 0,
        rolloutCount: 0,
        placementCount: 0,
        showSpend: false,
      })
    ).toEqual(['tasks', 'daily-line']);
  });

  it('puts Up next in the tasks slot when there are no tasks', () => {
    const blocks = orderHomeBlocks({ ...full, taskCount: 0 });
    expect(blocks).not.toContain('tasks');
    expect(blocks.indexOf('up-next')).toBe(1);
  });

  it('shows nothing in the tasks slot when there are no tasks and no Up next', () => {
    const blocks = orderHomeBlocks({ ...full, taskCount: 0, upNext: null });
    expect(blocks).not.toContain('tasks');
    expect(blocks).not.toContain('up-next');
  });

  it('shows Where the money went after Placements and before the daily line, and only when the manager may track spend', () => {
    const blocks = orderHomeBlocks(full);
    expect(blocks.indexOf('spend')).toBe(blocks.indexOf('placements') + 1);
    expect(blocks.indexOf('spend')).toBe(blocks.indexOf('daily-line') - 1);
    expect(orderHomeBlocks({ ...full, showSpend: false })).not.toContain('spend');
  });

  it("keeps the AI's daily line for days when nothing is late", () => {
    expect(orderHomeBlocks({ ...full, lateCount: 2 })).not.toContain('daily-line');
  });
});

describe('HOME_BLOCK_LABELS', () => {
  it('calls the object a rollout, never a release', () => {
    for (const label of Object.values(HOME_BLOCK_LABELS)) {
      expect(label).not.toMatch(/release/i);
    }
    expect(HOME_BLOCK_LABELS.rollouts).toBe('Rollouts');
    // The brief's own title.
    expect(HOME_BLOCK_LABELS.spend).toBe('Where the money went');
  });
});
