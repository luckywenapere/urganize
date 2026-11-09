import { describe, expect, it } from 'vitest';
import { COMPLETION_SURFACE_ORDER, nextCompletionSurfaces } from './completion-surfaces';

type Surface = { taskId: string } | null;
const none: Record<'completionToast' | 'outcomePrompt' | 'coverArtPrompt' | 'vouchPrompt', Surface> = {
  completionToast: null,
  outcomePrompt: null,
  coverArtPrompt: null,
  vouchPrompt: null,
};

describe('nextCompletionSurfaces', () => {
  it('replaces an open check-in with the next completion’s cover art ask', () => {
    const current = { ...none, outcomePrompt: { taskId: 'a' } };
    const next = nextCompletionSurfaces(current, { coverArtPrompt: { taskId: 'b' } });
    expect(next).toEqual({ ...none, coverArtPrompt: { taskId: 'b' } });
  });

  it('closes an earlier sheet when a bulk completion shows the toast', () => {
    const current = { ...none, vouchPrompt: { taskId: 'a' } };
    const next = nextCompletionSurfaces(current, { completionToast: { taskId: 'b' } });
    expect(next).toEqual({ ...none, completionToast: { taskId: 'b' } });
  });

  it('leaves whatever is open alone when the new completion asks nothing', () => {
    const current = { ...none, outcomePrompt: { taskId: 'a' } };
    expect(nextCompletionSurfaces(current, {})).toEqual(current);
    expect(nextCompletionSurfaces(current, { coverArtPrompt: null })).toEqual(current);
  });

  it('keeps exactly one surface even if a caller offers two, by priority', () => {
    const next = nextCompletionSurfaces(none, {
      completionToast: { taskId: 't' },
      coverArtPrompt: { taskId: 'c' },
    });
    expect(next).toEqual({ ...none, coverArtPrompt: { taskId: 'c' } });
  });

  it('never returns more than one open surface', () => {
    const offers = [
      { coverArtPrompt: 1 },
      { vouchPrompt: 1 },
      { outcomePrompt: 1 },
      { completionToast: 1 },
      { completionToast: 1, outcomePrompt: 1, vouchPrompt: 1 },
    ];
    const current = { completionToast: 9, outcomePrompt: 9, coverArtPrompt: 9, vouchPrompt: 9 };
    for (const offer of offers) {
      const next = nextCompletionSurfaces(current, offer);
      const open = COMPLETION_SURFACE_ORDER.filter((key) => next[key] !== null);
      expect(open).toHaveLength(1);
    }
  });

  it('lists the priority as cover art, vouch, check-in, toast', () => {
    expect(COMPLETION_SURFACE_ORDER).toEqual([
      'coverArtPrompt',
      'vouchPrompt',
      'outcomePrompt',
      'completionToast',
    ]);
  });
});
