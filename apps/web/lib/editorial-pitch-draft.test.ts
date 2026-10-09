import { describe, expect, it } from 'vitest';
import {
  EMPTY_PITCH_CONTEXT,
  buildPitchMessages,
  emptyPitchFieldKeys,
  parsePitchDraftResponse,
  type PitchContext,
} from './editorial-pitch-draft';
import { EMPTY_PITCH_FIELDS, PITCH_DESCRIPTION_MAX } from './editorial-pitch';

const context = (over: Partial<PitchContext> = {}): PitchContext => ({
  ...EMPTY_PITCH_CONTEXT,
  title: 'Lagos Nights',
  artistName: 'Dorian',
  format: 'single',
  genre: 'Afrobeats',
  ...over,
});

describe('emptyPitchFieldKeys', () => {
  it('lists only the fields with nothing in them', () => {
    expect(emptyPitchFieldKeys({ ...EMPTY_PITCH_FIELDS, genre: 'Afrobeats', moods: '  ' })).toEqual([
      'moods',
      'instruments',
      'description',
    ]);
  });

  it('is empty when every field is filled', () => {
    expect(
      emptyPitchFieldKeys({ genre: 'a', moods: 'b', instruments: 'c', description: 'd' })
    ).toEqual([]);
  });
});

describe('buildPitchMessages', () => {
  it('asks for exactly the wanted fields and no others', () => {
    const [, user] = buildPitchMessages(context(), ['moods', 'description']);
    expect(user.content).toContain('"moods", "description"');
    expect(user.content).not.toContain('"genre"');
    expect(user.content).not.toContain('"instruments"');
  });

  it('tells the model to use only the given facts and to leave a gap empty', () => {
    const [system] = buildPitchMessages(context(), ['genre']);
    expect(system.content).toMatch(/ONLY the facts/);
    expect(system.content).toMatch(/empty string/);
  });

  it('puts the 500 character limit in the description ask', () => {
    const [, user] = buildPitchMessages(context(), ['description']);
    expect(user.content).toContain(String(PITCH_DESCRIPTION_MAX));
  });

  it('carries the facts it was given and leaves out the ones it was not', () => {
    const [, user] = buildPitchMessages(
      context({ story: 'Written after a night drive.', creditRoles: ['producer', 'producer', 'mixer'] }),
      ['description']
    );
    expect(user.content).toContain('Artist: Dorian');
    expect(user.content).toContain('The story: Written after a night drive.');
    // Roles only, once each: no names ever reach the prompt.
    expect(user.content).toContain('Collaborators on it: producer, mixer');
    expect(user.content).not.toContain('Language:');
  });

  it('refuses to build a prompt with nothing to ask', () => {
    expect(() => buildPitchMessages(context(), [])).toThrow();
  });
});

describe('parsePitchDraftResponse', () => {
  it('reads a good answer', () => {
    expect(
      parsePitchDraftResponse(
        JSON.stringify({ genre: 'Afrobeats', moods: ['warm', 'late night'], instruments: '', description: 'A song.' })
      )
    ).toEqual({ genre: 'Afrobeats', moods: 'warm, late night', instruments: '', description: 'A song.' });
  });

  it('cuts a long description at a word, under the limit', () => {
    const long = 'word '.repeat(200);
    const parsed = parsePitchDraftResponse(JSON.stringify({ description: long }));
    expect(parsed).not.toBeNull();
    expect(parsed!.description.length).toBeLessThanOrEqual(PITCH_DESCRIPTION_MAX);
    expect(parsed!.description.endsWith('word')).toBe(true);
  });

  it('treats anything that is not an object as a failed draft', () => {
    for (const raw of ['not json', '"text"', '[]', 'null', '7']) {
      expect(parsePitchDraftResponse(raw)).toBeNull();
    }
  });

  it('treats an answer with every field empty as a failed draft, not a success', () => {
    expect(
      parsePitchDraftResponse(JSON.stringify({ genre: '', moods: '', instruments: '', description: '' }))
    ).toBeNull();
    expect(parsePitchDraftResponse('{}')).toBeNull();
  });
});
