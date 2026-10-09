import { describe, expect, it } from 'vitest';
import {
  DRAFT_DISCARD_WINDOW_MS,
  buildDraftDiscardPath,
  decideDraftDiscard,
  isTitleUntouched,
  normalizeCreatedTitle,
  type DraftDiscardCounts,
  type DraftDiscardRelease,
} from './release-draft-discard';

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

  // The create step takes an optional title (v1.91.3). An abandoned planner on
  // a rollout that was only NAMED at creation is still an empty shell.
  it('discards an untouched shell that carries the title it was created with', () => {
    expect(decideDraftDiscard(shell({ title: 'Midnight' }), empty(), NOW, 'Midnight')).toEqual({ discard: true });
    // Whitespace the server trimmed away does not make it a different title.
    expect(decideDraftDiscard(shell({ title: 'Midnight' }), empty(), NOW, '  Midnight ')).toEqual({ discard: true });
  });

  it('keeps a named shell when the caller does not vouch for its created title', () => {
    expect(decideDraftDiscard(shell({ title: 'Midnight' }), empty(), NOW)).toEqual({ discard: false, reason: 'edited' });
    expect(decideDraftDiscard(shell({ title: 'Midnight' }), empty(), NOW, null).discard).toBe(false);
    expect(decideDraftDiscard(shell({ title: 'Midnight' }), empty(), NOW, '   ').discard).toBe(false);
  });

  it('keeps a shell that was renamed after it was created', () => {
    expect(decideDraftDiscard(shell({ title: 'Midnight (Deluxe)' }), empty(), NOW, 'Midnight')).toEqual({
      discard: false,
      reason: 'edited',
    });
    // Case counts as a change: the rule only says yes to an exact match.
    expect(decideDraftDiscard(shell({ title: 'midnight' }), empty(), NOW, 'Midnight').discard).toBe(false);
  });

  it('never lets a created title outweigh any other sign of work', () => {
    const named = shell({ title: 'Midnight' });
    for (const key of ['tasks', 'taskGroups', 'assets', 'songs', 'spend', 'collaborators'] as const) {
      expect(decideDraftDiscard(named, empty({ [key]: 1 }), NOW, 'Midnight')).toEqual({
        discard: false,
        reason: 'has_content',
      });
      expect(decideDraftDiscard(named, empty({ [key]: null }), NOW, 'Midnight').discard).toBe(false);
    }
    expect(decideDraftDiscard({ ...named, releaseDate: '2026-12-01' }, empty(), NOW, 'Midnight').discard).toBe(false);
    expect(decideDraftDiscard({ ...named, description: 'A note' }, empty(), NOW, 'Midnight').discard).toBe(false);
    expect(decideDraftDiscard({ ...named, artworkAssetId: 'asset-1' }, empty(), NOW, 'Midnight').discard).toBe(false);
    expect(decideDraftDiscard({ ...named, status: 'active' }, empty(), NOW, 'Midnight').discard).toBe(false);
    expect(decideDraftDiscard({ ...named, metadata: null }, empty(), NOW, 'Midnight').discard).toBe(false);
    expect(
      decideDraftDiscard({ ...named, metadata: { planner_pending: true, x: 1 } }, empty(), NOW, 'Midnight').discard
    ).toBe(false);
    const old = new Date(NOW.getTime() - DRAFT_DISCARD_WINDOW_MS - 1).toISOString();
    expect(decideDraftDiscard({ ...named, createdAt: old }, empty(), NOW, 'Midnight').discard).toBe(false);
  });

  it('still discards a default-titled shell whatever created title is sent', () => {
    expect(decideDraftDiscard(shell(), empty(), NOW, 'Midnight')).toEqual({ discard: true });
  });
});

describe('normalizeCreatedTitle', () => {
  it('accepts a real title, trimmed', () => {
    expect(normalizeCreatedTitle(' Midnight ')).toBe('Midnight');
  });

  it('ignores blank, default, missing and over-long values', () => {
    expect(normalizeCreatedTitle('')).toBeNull();
    expect(normalizeCreatedTitle('   ')).toBeNull();
    expect(normalizeCreatedTitle(null)).toBeNull();
    expect(normalizeCreatedTitle(undefined)).toBeNull();
    expect(normalizeCreatedTitle('Untitled rollout')).toBeNull();
    expect(normalizeCreatedTitle('x'.repeat(141))).toBeNull();
    expect(normalizeCreatedTitle('x'.repeat(140))).toBe('x'.repeat(140));
  });
});

describe('isTitleUntouched', () => {
  it('is true for the default title and for the exact created title only', () => {
    expect(isTitleUntouched('Untitled rollout')).toBe(true);
    expect(isTitleUntouched('Midnight', 'Midnight')).toBe(true);
    expect(isTitleUntouched('Midnight')).toBe(false);
    expect(isTitleUntouched('Midnight 2', 'Midnight')).toBe(false);
    expect(isTitleUntouched(null)).toBe(false);
  });
});

describe('buildDraftDiscardPath', () => {
  it('sends exactly the v1.91.1 request for an untitled shell', () => {
    expect(buildDraftDiscardPath('rel-1')).toBe('/api/releases/rel-1?onlyIfUntouchedDraft=1');
    expect(buildDraftDiscardPath('rel-1', null)).toBe('/api/releases/rel-1?onlyIfUntouchedDraft=1');
    expect(buildDraftDiscardPath('rel-1', 'Untitled rollout')).toBe('/api/releases/rel-1?onlyIfUntouchedDraft=1');
  });

  it('carries a real created title, encoded', () => {
    const path = buildDraftDiscardPath('rel-1', 'Love & Lagos?');
    const url = new URL(path, 'https://app.example');
    expect(url.pathname).toBe('/api/releases/rel-1');
    expect(url.searchParams.get('onlyIfUntouchedDraft')).toBe('1');
    expect(url.searchParams.get('createdTitle')).toBe('Love & Lagos?');
  });
});
