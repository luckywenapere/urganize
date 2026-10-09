import { describe, expect, it } from 'vitest';
import { DRAFT_DISCARD_WINDOW_MS, decideDraftDiscard, type DraftDiscardCounts, type DraftDiscardRelease } from './release-draft-discard';

const NOW = new Date('2026-10-09T15:00:00.000Z');

function shell(over: Partial<DraftDiscardRelease> = {}): DraftDiscardRelease {
  return {
    title: 'Untitled rollout',
    status: 'draft',
    releaseDate: null,
    description: null,
    artworkAssetId: null,
    metadata: { planner_pending: true },
    createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    ...over,
  };
}

function empty(over: Partial<DraftDiscardCounts> = {}): DraftDiscardCounts {
  return { tasks: 0, taskGroups: 0, assets: 0, songs: 0, spend: 0, collaborators: 0, ...over };
}

describe('decideDraftDiscard', () => {
  it('discards an untouched shell the planner left behind', () => {
    expect(decideDraftDiscard(shell(), empty(), NOW)).toEqual({ discard: true });
  });

  it('keeps a rollout that is no longer waiting for its plan', () => {
    expect(decideDraftDiscard(shell({ metadata: null }), empty(), NOW)).toEqual({
      discard: false,
      reason: 'not_planner_pending',
    });
    expect(decideDraftDiscard(shell({ metadata: { planner_pending: false } }), empty(), NOW).discard).toBe(false);
  });

  it('keeps a rollout whose metadata carries anything besides the planner flag', () => {
    expect(
      decideDraftDiscard(shell({ metadata: { planner_pending: true, test_release: true } }), empty(), NOW)
    ).toEqual({ discard: false, reason: 'edited' });
  });

  it('keeps a rollout that is not a draft any more', () => {
    expect(decideDraftDiscard(shell({ status: 'active' }), empty(), NOW)).toEqual({
      discard: false,
      reason: 'not_draft',
    });
  });

  it('keeps a rollout somebody typed into', () => {
    expect(decideDraftDiscard(shell({ title: 'Midnight EP' }), empty(), NOW).discard).toBe(false);
    expect(decideDraftDiscard(shell({ releaseDate: '2026-12-01' }), empty(), NOW).discard).toBe(false);
    expect(decideDraftDiscard(shell({ description: 'A note' }), empty(), NOW).discard).toBe(false);
    expect(decideDraftDiscard(shell({ artworkAssetId: 'asset-1' }), empty(), NOW).discard).toBe(false);
  });

  it('keeps a shell older than the window, so one kept on purpose is never swept up', () => {
    const old = new Date(NOW.getTime() - DRAFT_DISCARD_WINDOW_MS - 1).toISOString();
    expect(decideDraftDiscard(shell({ createdAt: old }), empty(), NOW)).toEqual({ discard: false, reason: 'too_old' });
  });

  it('keeps a rollout with an unreadable or future creation time', () => {
    expect(decideDraftDiscard(shell({ createdAt: null }), empty(), NOW).discard).toBe(false);
    expect(decideDraftDiscard(shell({ createdAt: 'not a date' }), empty(), NOW).discard).toBe(false);
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    expect(decideDraftDiscard(shell({ createdAt: future }), empty(), NOW).discard).toBe(false);
  });

  it('keeps a rollout with any activity, group, file, song, spend or collaborator', () => {
    for (const key of ['tasks', 'taskGroups', 'assets', 'songs', 'spend', 'collaborators'] as const) {
      expect(decideDraftDiscard(shell(), empty({ [key]: 1 }), NOW)).toEqual({
        discard: false,
        reason: 'has_content',
      });
    }
  });

  it('fails closed when any count could not be read', () => {
    for (const key of ['tasks', 'taskGroups', 'assets', 'songs', 'spend', 'collaborators'] as const) {
      expect(decideDraftDiscard(shell(), empty({ [key]: null }), NOW)).toEqual({
        discard: false,
        reason: 'unverifiable',
      });
    }
  });
});
