import { describe, expect, it } from 'vitest';
import { recapFileName } from './recap-share';

// The name the recap lands under when somebody saves or shares it. It was
// local to RecapModal until 2026-09-07, when the recap moved into the UrgAns
// conversation (founder call) and a second surface needed the same name — a
// file called `blob` or `download.png` is the whole reason this exists.
describe('recapFileName', () => {
  it('slugs the release title and names the size', () => {
    expect(recapFileName('Midnight EP', 'story')).toBe('midnight-ep-recap-story.png');
    expect(recapFileName('Midnight EP', 'square')).toBe('midnight-ep-recap-square.png');
  });

  it('collapses punctuation and spacing into single hyphens', () => {
    expect(recapFileName('Best  —  Babyboy   Dorian!!', 'story')).toBe(
      'best-babyboy-dorian-recap-story.png'
    );
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(recapFileName('!!! Ohema !!!', 'story')).toBe('ohema-recap-story.png');
  });

  it('falls back to "release" when a title slugs away to nothing', () => {
    // An emoji-only or punctuation-only title would otherwise produce
    // "-recap-story.png", which reads as a broken file rather than a poster.
    expect(recapFileName('!!!', 'story')).toBe('release-recap-story.png');
    expect(recapFileName('', 'square')).toBe('release-recap-square.png');
  });

  it('caps the slug so the name stays a filename', () => {
    const long = 'a'.repeat(80);
    expect(recapFileName(long, 'story')).toBe(`${'a'.repeat(40)}-recap-story.png`);
  });

  it('trims a hyphen the cap itself left behind', () => {
    // This title's slug is 47 chars and its 40th is the hyphen after
    // "deluxe", so trimming before slicing is not enough — a naive cap yields
    // "...-deluxe--recap-story.png" with a double hyphen. The order matters,
    // and only a title that caps on a word boundary can catch it.
    expect(recapFileName('The Midnight Sessions Volume Two Deluxe Edition', 'story')).toBe(
      'the-midnight-sessions-volume-two-deluxe-recap-story.png'
    );
  });
});
