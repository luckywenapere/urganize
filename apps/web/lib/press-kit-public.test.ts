import { describe, expect, it } from 'vitest';
import {
  embargoNotice,
  isKitIndexable,
  isKitLive,
  kitDescription,
  kitTagline,
  publicSections,
} from './press-kit-public';
import type { PressKitSectionKey } from '@/types/press-kits';

const section = (
  key: PressKitSectionKey,
  publishedContent: Record<string, unknown> | null,
  hidden = false
) => ({ section: key, publishedContent, hidden });

describe('isKitIndexable', () => {
  it('indexes only the listed setting', () => {
    expect(isKitIndexable('public_listed')).toBe(true);
    expect(isKitIndexable('public')).toBe(false);
    expect(isKitIndexable('link_only')).toBe(false);
  });
});

describe('isKitLive', () => {
  it('needs a published date', () => {
    expect(isKitLive('2026-09-01T00:00:00Z')).toBe(true);
    expect(isKitLive(null)).toBe(false);
    expect(isKitLive(undefined)).toBe(false);
    expect(isKitLive('')).toBe(false);
  });
});

describe('embargoNotice', () => {
  const now = new Date('2026-09-05T12:00:00Z');

  it('says nothing when there is no date', () => {
    expect(embargoNotice(null, now)).toBeNull();
    expect(embargoNotice('', now)).toBeNull();
  });

  it('names a future date', () => {
    const notice = embargoNotice('2026-09-30', now);
    expect(notice).toContain('September 30, 2026');
    expect(notice).toContain('do not publish');
  });

  it('says nothing once the date has passed', () => {
    expect(embargoNotice('2026-09-01', now)).toBeNull();
  });

  it('says nothing on the day itself', () => {
    // The embargo lifts on that date, so the page must stop asking press to
    // hold the story on the morning they are allowed to run it.
    expect(embargoNotice('2026-09-05', now)).toBeNull();
  });

  it('says nothing for an unreadable date', () => {
    expect(embargoNotice('soon', now)).toBeNull();
  });
});

describe('publicSections', () => {
  it('renders published content, never the working draft', () => {
    // The one rule that stops half typed copy reaching a journalist.
    const result = publicSections([
      { section: 'bios', publishedContent: { short: 'Published words' }, hidden: false },
    ]);
    expect(result).toEqual([{ section: 'bios', content: { short: 'Published words' } }]);
  });

  it('ignores a draft that disagrees with the published copy', () => {
    // The fixture carries BOTH, because a fixture with only the published
    // field cannot tell the two apart and a mutation swapping them survives.
    // This is the case that actually pins the rule.
    const result = publicSections([
      {
        section: 'bios',
        content: { short: 'Half typed draft' },
        publishedContent: { short: 'Published words' },
        hidden: false,
      } as never,
    ]);
    expect(result).toEqual([{ section: 'bios', content: { short: 'Published words' } }]);
  });

  it('drops a section that has never been published', () => {
    expect(publicSections([section('bios', null)])).toEqual([]);
  });

  it('drops a hidden section even when it has content', () => {
    expect(publicSections([section('bios', { short: 'Hidden' }, true)])).toEqual([]);
  });

  it('drops an empty section rather than showing a bare heading', () => {
    expect(publicSections([section('bios', { short: '   ' })])).toEqual([]);
    expect(publicSections([section('press', { coverage: [] })])).toEqual([]);
  });

  it('never emits the assets section, whose photos are their own table', () => {
    expect(publicSections([section('assets', { anything: 'here' })])).toEqual([]);
  });

  it('returns them in the standard order whatever order they arrive in', () => {
    const result = publicSections([
      section('contact', { contacts: [{ name: 'Ada' }] }),
      section('bios', { short: 'A bio' }),
      section('header', { descriptor: 'A descriptor' }),
    ]);
    expect(result.map((entry) => entry.section)).toEqual(['header', 'bios', 'contact']);
  });
});

describe('kitTagline', () => {
  it('joins the descriptor and the place', () => {
    expect(kitTagline({ descriptor: 'Afrobeats singer', homeCity: 'Lagos', homeCountry: 'Nigeria' })).toBe(
      'Afrobeats singer · Lagos, Nigeria'
    );
  });

  it('falls back to whichever half exists', () => {
    expect(kitTagline({ descriptor: 'Producer' })).toBe('Producer');
    expect(kitTagline({ homeCity: 'Accra' })).toBe('Accra');
  });

  it('is empty rather than invented when there is nothing', () => {
    expect(kitTagline({})).toBe('');
  });
});

describe('kitDescription', () => {
  it('prefers the short bio', () => {
    expect(kitDescription('Dorian', { descriptor: 'Singer' }, { short: 'A short bio.' })).toBe(
      'A short bio.'
    );
  });

  it('trims a long bio rather than emitting the whole thing', () => {
    const long = 'x'.repeat(400);
    const result = kitDescription('Dorian', {}, { short: long });
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result.endsWith('...')).toBe(true);
  });

  it('falls back to the tagline, then to the name alone', () => {
    expect(kitDescription('Dorian', { descriptor: 'Singer' }, {})).toBe('Dorian. Singer');
    expect(kitDescription('Dorian', {}, {})).toBe('Press kit for Dorian.');
  });

  it('never invents a claim about the artist', () => {
    // The brief's hardest rule: empty beats fake. With nothing to say, the
    // description names the page and stops.
    const result = kitDescription('Dorian', {}, {});
    expect(result).not.toMatch(/rising|acclaimed|breakout|award/i);
  });
});
