import { describe, expect, it } from 'vitest';
import { pickSameArtist, pickSuggestion, shouldAskToLink, type StreamingLinkState } from './rules';

const unlinked: StreamingLinkState = {
  deezerArtistId: null,
  appleArtistId: null,
  spotifyArtistId: null,
  linkedAt: null,
  skippedAt: null,
};

describe('shouldAskToLink', () => {
  it('asks about an artist with no link', () => {
    expect(shouldAskToLink(unlinked, [], '2026-11-06')).toBe(true);
  });

  it('never asks about a linked artist', () => {
    expect(shouldAskToLink({ ...unlinked, deezerArtistId: '123' }, [], '2026-11-06')).toBe(false);
    expect(shouldAskToLink({ ...unlinked, appleArtistId: '9' }, [], '2026-11-06')).toBe(false);
  });

  it('stops asking after "Not on streaming yet" until a rollout comes out after it', () => {
    const skipped = { ...unlinked, skippedAt: '2026-11-01T10:00:00Z' };
    expect(shouldAskToLink(skipped, [], '2026-11-06')).toBe(false);
    expect(shouldAskToLink(skipped, ['2026-10-20'], '2026-11-06')).toBe(false);
    expect(shouldAskToLink(skipped, ['2026-11-20'], '2026-11-06')).toBe(false);
    expect(shouldAskToLink(skipped, ['2026-11-05'], '2026-11-06')).toBe(true);
  });
});

describe('pickSuggestion', () => {
  const results = [
    { id: '1', name: 'Dorian Electra', followers: 310000 },
    { id: '2', name: 'Dorian', followers: 12400 },
    { id: '3', name: 'DORIAN', followers: 90 },
  ];

  it('picks the exact name with the most fans', () => {
    expect(pickSuggestion('Dorian', results)?.id).toBe('2');
  });

  it('suggests nobody when no name matches', () => {
    expect(pickSuggestion('Tems', results)).toBeNull();
  });
});

describe('pickSameArtist', () => {
  it('takes the only exact name', () => {
    expect(pickSameArtist('Tems', [{ id: 'a', name: 'Tems' }, { id: 'b', name: 'Temsy' }], null)).toBe('a');
  });

  it('needs a known song when two share the name', () => {
    const two = [
      { id: 'a', name: 'Dorian', songTitles: ['Ohema'] },
      { id: 'b', name: 'Dorian', songTitles: ['Fanfare'] },
    ];
    expect(pickSameArtist('Dorian', two, 'Ohema')).toBe('a');
    expect(pickSameArtist('Dorian', two, null)).toBeNull();
    expect(pickSameArtist('Dorian', two, 'Unknown')).toBeNull();
  });

  it('links nobody with no exact name', () => {
    expect(pickSameArtist('Dorian', [{ id: 'a', name: 'Dorian Electra' }], null)).toBeNull();
  });
});
