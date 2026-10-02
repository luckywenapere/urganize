import { describe, expect, it } from 'vitest';
import {
  MAX_CREDITS,
  MAX_STORY_LENGTH,
  creditsFromSubmissions,
  effectiveCredits,
  parseFieldsPatch,
  pitchKitChecklist,
  pitchNoteFromStory,
  readStoredFields,
  type ReleaseEpkFields,
} from './release-epk';

const fields = (over: Partial<ReleaseEpkFields> = {}): ReleaseEpkFields => ({
  story: '',
  storySource: 'user',
  credits: null,
  ...over,
});

describe('creditsFromSubmissions', () => {
  it('prefers the stage name and joins the roles', () => {
    expect(
      creditsFromSubmissions([
        { legalName: 'Tunde Bakare', stageName: 'TB Beats', roles: ['producer', 'mix_engineer'] },
      ])
    ).toEqual([{ name: 'TB Beats', role: 'producer, mix engineer' }]);
  });

  it('falls back to the legal name and skips nameless rows', () => {
    const out = creditsFromSubmissions([
      { legalName: 'Ada Obi', stageName: null, roles: [] },
      { legalName: '  ', stageName: '', roles: ['writer'] },
    ]);
    expect(out).toEqual([{ name: 'Ada Obi', role: '' }]);
  });

  it('drops an exact repeat and caps the list', () => {
    const dup = { legalName: 'Ada', stageName: null, roles: ['writer'] };
    expect(creditsFromSubmissions([dup, dup])).toHaveLength(1);
    const many = Array.from({ length: MAX_CREDITS + 10 }, (_, i) => ({
      legalName: `Person ${i}`,
      stageName: null,
      roles: [],
    }));
    expect(creditsFromSubmissions(many)).toHaveLength(MAX_CREDITS);
  });

  it('never carries anything beyond name and role', () => {
    const out = creditsFromSubmissions([
      {
        legalName: 'Ada',
        stageName: null,
        roles: [],
        // Extra private fields a caller might hand over by mistake.
        ...({ email: 'a@b.c', ipi: '123', publisher: 'X' } as object),
      } as never,
    ]);
    expect(Object.keys(out[0]).sort()).toEqual(['name', 'role']);
  });
});

describe('effectiveCredits', () => {
  const submitted = [{ name: 'Collected', role: 'writer' }];
  it('uses the collected ones until the manager makes a list', () => {
    expect(effectiveCredits(fields({ credits: null }), submitted)).toBe(submitted);
  });
  it('keeps a list the manager emptied: it is theirs', () => {
    expect(effectiveCredits(fields({ credits: [] }), submitted)).toEqual([]);
  });
  it('shows the manager list as written', () => {
    const own = [{ name: 'Mine', role: '' }];
    expect(effectiveCredits(fields({ credits: own }), submitted)).toBe(own);
  });
});

describe('parseFieldsPatch', () => {
  it('is sparse: an omitted key is left alone', () => {
    const r = parseFieldsPatch({ story: 'Hello' });
    expect(r).toEqual({ ok: true, patch: { story: 'Hello', storySource: 'user' } });
    if (r.ok) expect('credits' in r.patch).toBe(false);
  });

  it('returns to automatic only on an explicit null', () => {
    const r = parseFieldsPatch({ credits: null });
    expect(r).toEqual({ ok: true, patch: { credits: null } });
  });

  it('cleans credits and drops nameless entries', () => {
    const r = parseFieldsPatch({ credits: [{ name: '  Ada  ', role: ' writer ' }, { name: '' }] });
    expect(r).toEqual({ ok: true, patch: { credits: [{ name: 'Ada', role: 'writer' }] } });
  });

  it('refuses a long story, a bad shape and an empty patch', () => {
    expect(parseFieldsPatch({ story: 'x'.repeat(MAX_STORY_LENGTH + 1) }).ok).toBe(false);
    expect(parseFieldsPatch({ story: 5 }).ok).toBe(false);
    expect(parseFieldsPatch({ credits: 'nope' }).ok).toBe(false);
    expect(parseFieldsPatch({}).ok).toBe(false);
    expect(parseFieldsPatch(null).ok).toBe(false);
    expect(parseFieldsPatch([]).ok).toBe(false);
  });

  it('saving a story marks the author as the person', () => {
    const r = parseFieldsPatch({ story: 'Mine' });
    if (r.ok) expect(r.patch.storySource).toBe('user');
  });
});

describe('readStoredFields', () => {
  it('reads a row and treats junk as the default', () => {
    expect(readStoredFields(null)).toEqual(fields());
    expect(readStoredFields({ story: 'S', story_source: 'ai', credits: null })).toEqual(
      fields({ story: 'S', storySource: 'ai' })
    );
    expect(readStoredFields({ credits: [{ name: 'A', role: 'r' }, { name: '' }] }).credits).toEqual(
      [{ name: 'A', role: 'r' }]
    );
  });
});

describe('pitchKitChecklist', () => {
  it('marks what is missing', () => {
    const list = pitchKitChecklist({
      fields: fields({ story: 'Yes' }),
      submittedCredits: [],
      hasCover: false,
      kitPublished: true,
    });
    expect(Object.fromEntries(list.map((i) => [i.key, i.done]))).toEqual({
      story: true,
      credits: false,
      cover: false,
      kit: true,
    });
  });
});


describe('pitchNoteFromStory', () => {
  it('returns a short story whole', () => {
    expect(pitchNoteFromStory('Written in Lagos in one night.')).toBe('Written in Lagos in one night.');
  });

  it('collapses line breaks and runs of spaces, since a note is one paragraph', () => {
    expect(pitchNoteFromStory('Written in Lagos.\n\n  Mixed   in London.')).toBe('Written in Lagos. Mixed in London.');
  });

  it('keeps whole sentences and never ends mid-sentence when one fits', () => {
    const story = `${'A'.repeat(100)}. ${'B'.repeat(100)}. ${'C'.repeat(100)}. ${'D'.repeat(100)}.`;
    const note = pitchNoteFromStory(story, 300);
    expect(note.length).toBeLessThanOrEqual(300);
    expect(note.endsWith('.')).toBe(true);
    expect(note).toBe(`${'A'.repeat(100)}. ${'B'.repeat(100)}.`);
    expect(note).not.toContain('D');
  });

  it('cuts a first sentence that is too long at a word and says so with an ellipsis', () => {
    const note = pitchNoteFromStory(`${'word '.repeat(100)}end.`, 50);
    expect(note.length).toBeLessThanOrEqual(50);
    expect(note.endsWith('…')).toBe(true);
    expect(note).not.toMatch(/\s…$/);
    expect(note.slice(0, -1)).toMatch(/^(word )*word$/);
  });

  it('never exceeds the cap, for any length', () => {
    for (const max of [1, 2, 10, 40, 300]) {
      const note = pitchNoteFromStory('Hello there. '.repeat(80), max);
      expect(note.length).toBeLessThanOrEqual(max);
    }
  });

  it('returns nothing for an empty or blank story', () => {
    expect(pitchNoteFromStory('')).toBe('');
    expect(pitchNoteFromStory('   \n ')).toBe('');
  });

  it('defaults to the playlist note cap of 300', () => {
    expect(pitchNoteFromStory('x '.repeat(400)).length).toBeLessThanOrEqual(300);
  });
});
