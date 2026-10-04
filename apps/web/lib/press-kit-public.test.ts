import { describe, expect, it } from 'vitest';
import {
  embargoNotice,
  isKitIndexable,
  isKitLive,
  kitDescription,
  kitTagline,
  looksLikeWebAddress,
  PUBLIC_SECTION_ORDER,
  resolveKitLink,
  publicSections,
  successorPathForKit,
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
    expect(result.map((entry) => entry.section)).toEqual(['header', 'contact', 'bios']);
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

describe('successorPathForKit', () => {
  const live = { slug: 'dorian', publishedAt: '2026-09-01T00:00:00Z' };

  it('hands over to a published kit', () => {
    expect(successorPathForKit(live)).toBe('/k/dorian');
  });

  it('leaves an old link alone when the kit is not published', () => {
    // The whole point of the shim. An unpublished kit is a 404, so redirecting
    // to it would take away the page a journalist can read right now.
    expect(successorPathForKit({ slug: 'dorian', publishedAt: null })).toBeNull();
  });

  it('leaves an old link alone when there is no kit at all', () => {
    expect(successorPathForKit(null)).toBeNull();
  });

  it('leaves an old link alone when the kit has no slug', () => {
    expect(successorPathForKit({ slug: '', publishedAt: '2026-09-01T00:00:00Z' })).toBeNull();
    expect(successorPathForKit({ slug: '   ', publishedAt: '2026-09-01T00:00:00Z' })).toBeNull();
  });
});

describe('resolveKitLink', () => {
  it('rescues an address pasted into the label box', () => {
    const long =
      'https://open.spotify.com/artist/7dp5tbWcRoekRCHpCRUo7v?si=gEFw5AH1R5We2tB-Flv1gw&utm_source=copy-link';
    expect(resolveKitLink({ label: long, url: '' })).toEqual({
      href: long,
      label: 'Spotify',
    });
  });

  it('keeps a real label', () => {
    expect(resolveKitLink({ label: 'Listen', url: 'https://example.com/a' })).toEqual({
      href: 'https://example.com/a',
      label: 'Listen',
    });
  });

  it('never prints the address as the label', () => {
    expect(resolveKitLink({ label: 'https://x.com/dorian', url: 'https://x.com/dorian' })?.label).toBe('X');
  });

  it('adds https to a bare domain', () => {
    expect(resolveKitLink({ label: '', url: 'www.instagram.com/dorian' })).toEqual({
      href: 'https://www.instagram.com/dorian',
      label: 'Instagram',
    });
  });

  it('names an unknown site by its host', () => {
    expect(resolveKitLink({ url: 'https://www.dorian.com/press' })?.label).toBe('dorian.com');
  });

  it('refuses anything that is not http(s)', () => {
    expect(resolveKitLink({ label: 'x', url: 'javascript:alert(1)' })).toBeNull();
    expect(resolveKitLink({ label: 'x', url: 'mailto:a@b.com' })).toBeNull();
    expect(resolveKitLink({ label: 'x', url: 'data:text/html,hi' })).toBeNull();
  });

  it('drops empty, spaced or non-string entries', () => {
    expect(resolveKitLink({})).toBeNull();
    expect(resolveKitLink({ label: 'Spotify', url: '' })).toBeNull();
    expect(resolveKitLink({ url: 'not a link' })).toBeNull();
    expect(resolveKitLink({ label: 5, url: 7 })).toBeNull();
  });

  it('does not rescue the label when a bad url was typed', () => {
    expect(resolveKitLink({ label: 'https://a.com', url: 'javascript:x' })).toBeNull();
  });
});

describe('looksLikeWebAddress', () => {
  it('spots addresses and ignores names', () => {
    expect(looksLikeWebAddress('https://open.spotify.com/artist/1')).toBe(true);
    expect(looksLikeWebAddress('instagram.com/dorian')).toBe(true);
    expect(looksLikeWebAddress('Spotify')).toBe(false);
    expect(looksLikeWebAddress('Dorian live at the O2')).toBe(false);
    expect(looksLikeWebAddress('javascript:alert(1)')).toBe(false);
    expect(looksLikeWebAddress(null)).toBe(false);
  });
});

describe('PUBLIC_SECTION_ORDER', () => {
  it('lists every section exactly once', async () => {
    const { PRESS_KIT_SECTIONS } = await import('@/types/press-kits');
    expect([...PUBLIC_SECTION_ORDER].sort()).toEqual([...PRESS_KIT_SECTIONS].sort());
  });
  it('puts contact first and links last', () => {
    expect(PUBLIC_SECTION_ORDER[0]).toBe('header');
    expect(PUBLIC_SECTION_ORDER[1]).toBe('contact');
    expect(PUBLIC_SECTION_ORDER[PUBLIC_SECTION_ORDER.length - 1]).toBe('links');
    expect(PUBLIC_SECTION_ORDER.indexOf('bios')).toBeLessThan(PUBLIC_SECTION_ORDER.indexOf('assets'));
  });
});

describe('link edge cases', () => {
  const resolve = (label: unknown, url: unknown) => resolveKitLink({ label, url });

  it('refuses addresses with embedded credentials', () => {
    expect(resolve('Spotify', 'https://open.spotify.com@evil.example/x')).toBeNull();
    expect(resolve('', 'https://user:pass@example.com')).toBeNull();
  });
  it('refuses absurdly long addresses', () => {
    expect(resolve('x', `https://example.com/${'a'.repeat(2100)}`)).toBeNull();
  });
  it('accepts an upper case scheme and surrounding whitespace', () => {
    expect(resolve('Site', '  HTTPS://Example.com/a  ')?.href).toBe('https://example.com/a');
  });
  it('keeps ports, queries and fragments', () => {
    expect(resolve('x', 'http://example.com:8080/a?b=1#c')?.href).toBe('http://example.com:8080/a?b=1#c');
  });
  it('refuses protocol-relative, ftp, file, tel and blob', () => {
    for (const bad of ['//example.com', 'ftp://example.com', 'file:///etc/passwd', 'tel:+234', 'blob:https://a.com/x']) {
      expect(resolve('x', bad)).toBeNull();
    }
  });
  it('refuses an address with a space inside it', () => {
    expect(resolve('x', 'https://example.com/a b')).toBeNull();
  });
  it('does not treat a sentence or an email as an address', () => {
    expect(resolve('Check my site example.com', '')).toBeNull();
    expect(resolve('', 'ada@example.com')).toBeNull();
    expect(resolve('', 'hello')).toBeNull();
  });
  it('names subdomains of known sites', () => {
    expect(resolve('', 'https://dorian.bandcamp.com')?.label).toBe('Bandcamp');
    expect(resolve('', 'https://m.youtube.com/watch?v=1')?.label).toBe('YouTube');
    expect(resolve('', 'https://music.youtube.com/x')?.label).toBe('YouTube Music');
  });
  it('treats unicode labels as real labels', () => {
    expect(resolve('Écoute ici', 'https://example.com')?.label).toBe('Écoute ici');
  });
  it('handles punycode and uppercase hosts', () => {
    expect(resolve('', 'https://EXAMPLE.COM')?.href).toBe('https://example.com/');
  });
  it('never throws on odd input types', () => {
    for (const value of [null, undefined, 0, {}, [], true]) {
      expect(() => resolve(value, value)).not.toThrow();
      expect(resolve(value, value)).toBeNull();
    }
  });
  it('is stable: resolving a resolved link changes nothing', () => {
    const once = resolve('', 'https://open.spotify.com/artist/1?si=a');
    expect(once && resolve(once.label, once.href)).toEqual(once);
  });
});

describe('publicSections edge cases', () => {
  it('drops a section whose content is only empty strings, nulls and empty lists', () => {
    expect(publicSections([section('contact', { contacts: [], note: '  ', x: null })])).toEqual([]);
  });
  it('treats a null published copy as never published', () => {
    expect(publicSections([section('bios', null)])).toEqual([]);
  });
  it('drops hidden sections even when filled', () => {
    expect(publicSections([section('bios', { short: 'x' }, true)])).toEqual([]);
  });
  it('keeps everything in reader order for a full kit', () => {
    const filled = { value: 'x' };
    const all = (['links', 'live', 'press', 'numbers', 'credits', 'video', 'music', 'latest_release', 'bios', 'contact', 'header'] as const).map(
      (key) => section(key, filled)
    );
    expect(publicSections(all).map((entry) => entry.section)).toEqual([
      'header', 'contact', 'bios', 'latest_release', 'music', 'video', 'credits', 'numbers', 'press', 'live', 'links',
    ]);
  });
});
