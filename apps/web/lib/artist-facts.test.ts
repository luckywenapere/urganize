import { describe, expect, it } from 'vitest';
import {
  MAX_FACT_LENGTH,
  MAX_OTHER_FACTS,
  describeFactForgetCard,
  describeFactSaveCard,
  factSourceLine,
  formatArtistFactsForPlanner,
  formatArtistFactsForPrompt,
  planFactSave,
  validateFactInput,
  type ArtistFact,
} from './artist-facts';

function fact(over: Partial<ArtistFact> & { id: string }): ArtistFact {
  return {
    workspaceId: 'ws1',
    artistId: 'kemi',
    topic: 'playlist_pitching',
    value: "Don't pitch",
    source: 'chat',
    saidBy: 'u1',
    createdAt: '2026-10-27T10:00:00Z',
    updatedAt: '2026-10-27T10:00:00Z',
    ...over,
  };
}

describe('validateFactInput', () => {
  it('accepts a known topic and trims the value', () => {
    expect(validateFactInput({ topic: 'budget', value: '  Under ₦100k   a single ' })).toEqual({
      ok: true,
      topic: 'budget',
      value: 'Under ₦100k a single',
    });
  });

  it('refuses an unknown topic', () => {
    expect(validateFactInput({ topic: 'mood', value: 'Happy' }).ok).toBe(false);
  });

  it('refuses an empty value', () => {
    expect(validateFactInput({ topic: 'budget', value: '   ' }).ok).toBe(false);
  });

  it(`refuses a value over ${MAX_FACT_LENGTH} characters rather than cutting it`, () => {
    expect(validateFactInput({ topic: 'other', value: 'a'.repeat(MAX_FACT_LENGTH) }).ok).toBe(true);
    const long = validateFactInput({ topic: 'other', value: 'a'.repeat(MAX_FACT_LENGTH + 1) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toMatch(/note/);
  });
});

describe('planFactSave', () => {
  it('inserts a first fact on a topic', () => {
    expect(planFactSave([], { topic: 'budget', value: 'Under ₦100k' })).toEqual({ kind: 'insert' });
  });

  it('replaces the one fact a topic holds, keeping what it was', () => {
    const old = fact({ id: 'f1' });
    expect(planFactSave([old], { topic: 'playlist_pitching', value: 'Pitch to playlists' })).toEqual({
      kind: 'replace',
      previous: old,
    });
  });

  it('calls the same value again unchanged, whatever its case', () => {
    const old = fact({ id: 'f1' });
    expect(planFactSave([old], { topic: 'playlist_pitching', value: "don't PITCH" }).kind).toBe('unchanged');
  });

  it('lets "other" hold several facts', () => {
    const existing = [fact({ id: 'o1', topic: 'other', value: 'Hates early calls' })];
    expect(planFactSave(existing, { topic: 'other', value: 'Vegan, mind the rider' })).toEqual({ kind: 'insert' });
  });

  it(`stops "other" at ${MAX_OTHER_FACTS}`, () => {
    const existing = Array.from({ length: MAX_OTHER_FACTS }, (_, i) =>
      fact({ id: `o${i}`, topic: 'other', value: `Thing ${i}` })
    );
    expect(planFactSave(existing, { topic: 'other', value: 'One more' }).kind).toBe('full');
  });

  it('edits a fact by id', () => {
    const old = fact({ id: 'f1', topic: 'other', value: 'Hates early calls' });
    expect(planFactSave([old], { factId: 'f1', topic: 'other', value: 'No calls before noon' })).toEqual({
      kind: 'replace',
      previous: old,
    });
  });

  it('reports a missing id', () => {
    expect(planFactSave([], { factId: 'nope', topic: 'budget', value: 'x' }).kind).toBe('missing');
  });

  it('refuses to move a fact onto a topic another fact already holds', () => {
    const budget = fact({ id: 'b', topic: 'budget', value: 'Under ₦100k' });
    const other = fact({ id: 'o', topic: 'other', value: 'Small budget' });
    expect(planFactSave([budget, other], { factId: 'o', topic: 'budget', value: 'Small budget' })).toEqual({
      kind: 'taken',
      holder: budget,
    });
  });
});

describe('formatArtistFactsForPrompt', () => {
  it('says nothing at all when there are no facts', () => {
    expect(formatArtistFactsForPrompt([])).toBe('');
    expect(formatArtistFactsForPrompt([{ artistName: 'Kemi', facts: [] }])).toBe('');
  });

  it('lists each fact under its artist, with where it came from', () => {
    const text = formatArtistFactsForPrompt([
      {
        artistName: 'Kemi',
        facts: [
          fact({ id: 'f1' }),
          fact({ id: 'f2', topic: 'preferred_channel', value: 'Instagram', source: 'manual', updatedAt: '2026-10-20T09:00:00Z' }),
        ],
      },
    ]);
    expect(text).toContain('Kemi');
    expect(text).toContain("- Playlist pitching: Don't pitch (said in chat, 2026-10-27)");
    expect(text).toContain('- Preferred channel: Instagram (set by hand, 2026-10-20)');
    // The instruction to follow them is part of the block, not left to ROLE.
    expect(text).toMatch(/follow/i);
  });

  it('skips an artist with nothing saved', () => {
    const text = formatArtistFactsForPrompt([
      { artistName: 'Kemi', facts: [fact({ id: 'f1' })] },
      { artistName: 'Ayra', facts: [] },
    ]);
    expect(text).not.toContain('Ayra');
  });
});

describe('formatArtistFactsForPlanner', () => {
  it('is empty with no facts and one line per fact otherwise', () => {
    expect(formatArtistFactsForPlanner([])).toBe('');
    expect(formatArtistFactsForPlanner([fact({ id: 'f1' })])).toBe(
      "What the team has decided about this artist (follow it): Playlist pitching: Don't pitch."
    );
  });
});

describe('confirmation card copy', () => {
  it('asks to remember a new fact', () => {
    const card = describeFactSaveCard('Kemi', { topic: 'playlist_pitching', value: "Don't pitch" }, { kind: 'insert' });
    expect(card).toMatchObject({ title: 'Remember this about Kemi?', confirmLabel: 'Save' });
    expect(card.detail).toContain("Playlist pitching: Don't pitch");
  });

  it('shows was and now when it replaces one', () => {
    const card = describeFactSaveCard(
      'Kemi',
      { topic: 'playlist_pitching', value: 'Pitch to playlists' },
      { kind: 'replace', previous: fact({ id: 'f1' }) }
    );
    expect(card.title).toBe('Change what UrgAns remembers about Kemi?');
    expect(card.detail).toContain("Was: Don't pitch.");
    expect(card.detail).toContain('Now: Pitch to playlists.');
    expect(card.confirmLabel).toBe('Update');
  });

  it('asks before forgetting one', () => {
    const card = describeFactForgetCard('Kemi', fact({ id: 'f1' }));
    expect(card.title).toBe('Forget this about Kemi?');
    expect(card.confirmLabel).toBe('Forget');
  });

  it('uses no em dashes anywhere', () => {
    const all = [
      describeFactSaveCard('Kemi', { topic: 'budget', value: 'x' }, { kind: 'insert' }),
      describeFactSaveCard('Kemi', { topic: 'budget', value: 'x' }, { kind: 'replace', previous: fact({ id: 'f' }) }),
      describeFactForgetCard('Kemi', fact({ id: 'f' })),
    ];
    expect(JSON.stringify(all)).not.toContain('—');
  });
});

describe('factSourceLine', () => {
  it('says who and where in plain words', () => {
    expect(factSourceLine(fact({ id: 'f1' }), { isMe: true, name: null })).toBe('You said it in chat · Oct 27');
    expect(
      factSourceLine(fact({ id: 'f1', source: 'manual', updatedAt: '2026-10-20T09:00:00Z' }), { isMe: false, name: 'Tobi' })
    ).toBe('Tobi set it · Oct 20');
    expect(factSourceLine(fact({ id: 'f1', saidBy: null }), { isMe: false, name: null })).toBe('Said in chat · Oct 27');
  });
});
