import { describe, expect, it } from 'vitest';

import {
  PRESS_KIT_SECTION_LABELS,
  applyKitToRoster,
  PRESS_KIT_SECTION_ORDER,
  VERSION_COALESCE_WINDOW_MS,
  VERSION_RETENTION_DAYS,
  canPublishKit,
  deriveKitState,
  deriveSectionStatus,
  hasUnpublishedChanges,
  isValidKitSlug,
  normalizeKitSlug,
  sameContent,
  shouldCoalesceVersion,
  versionPruneCutoffIso,
} from './press-kits';
import {
  PRESS_KIT_SECTIONS,
  type PressKit,
  type PressKitRosterEntry,
  type PressKitSection,
} from '@/types/press-kits';

const section = (over: Partial<PressKitSection> & { section: PressKitSection['section'] }): PressKitSection => ({
  id: `section-${over.section}`,
  content: {},
  publishedContent: null,
  status: 'empty',
  source: 'autofill',
  position: 0,
  hidden: false,
  updatedBy: null,
  updatedAt: '2026-09-05T10:00:00.000Z',
  ...over,
});

describe('the section list', () => {
  it('labels and orders every section, and nothing else', () => {
    expect(PRESS_KIT_SECTION_ORDER).toHaveLength(PRESS_KIT_SECTIONS.length);
    for (const key of PRESS_KIT_SECTIONS) {
      expect(PRESS_KIT_SECTION_LABELS[key]).toBeTruthy();
      expect(PRESS_KIT_SECTION_ORDER).toContain(key);
    }
  });

  it('puts the header first and the contact block above links', () => {
    expect(PRESS_KIT_SECTION_ORDER[0]).toBe('header');
    expect(PRESS_KIT_SECTION_ORDER.indexOf('contact')).toBeLessThan(
      PRESS_KIT_SECTION_ORDER.indexOf('links')
    );
  });

  it('uses no banned word in any label', () => {
    for (const key of PRESS_KIT_SECTIONS) {
      const label = PRESS_KIT_SECTION_LABELS[key];
      expect(label.toLowerCase()).not.toContain('workspace');
      expect(label).not.toContain('—');
    }
  });
});

describe('normalizeKitSlug', () => {
  it('lowercases and hyphenates a real artist name', () => {
    expect(normalizeKitSlug('Dorian Wave')).toBe('dorian-wave');
  });

  it('drops punctuation rather than encoding it', () => {
    expect(normalizeKitSlug("D'Prince & Co.")).toBe('d-prince-co');
  });

  it('never returns a leading or trailing hyphen', () => {
    expect(normalizeKitSlug('  --Ayra--  ')).toBe('ayra');
  });

  it('caps at 60 characters without leaving a trailing hyphen', () => {
    const slug = normalizeKitSlug(`${'a'.repeat(59)} bbbb`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
    expect(isValidKitSlug(slug)).toBe(true);
  });

  it('returns an empty string when there is nothing usable', () => {
    expect(normalizeKitSlug('!!!')).toBe('');
    expect(normalizeKitSlug('')).toBe('');
  });

  it('refuses a single character, because the database floor is two', () => {
    expect(normalizeKitSlug('X')).toBe('');
  });

  it('produces a slug the database will accept', () => {
    for (const name of ['Tems', 'Burna Boy', 'ODUMODUBLVCK', 'Àsa']) {
      expect(isValidKitSlug(normalizeKitSlug(name))).toBe(true);
    }
  });
});

describe('isValidKitSlug', () => {
  it('mirrors the database check exactly', () => {
    expect(isValidKitSlug('dorian-wave')).toBe(true);
    expect(isValidKitSlug('ab')).toBe(true);
    expect(isValidKitSlug('a')).toBe(false);
    expect(isValidKitSlug('Dorian')).toBe(false);
    expect(isValidKitSlug('dorian wave')).toBe(false);
    expect(isValidKitSlug('-dorian')).toBe(false);
    expect(isValidKitSlug('dorian-')).toBe(false);
    expect(isValidKitSlug('dorian--wave')).toBe(false);
    expect(isValidKitSlug('a'.repeat(61))).toBe(false);
  });
});

describe('deriveSectionStatus', () => {
  it('calls a section with nothing in it empty', () => {
    expect(deriveSectionStatus('bios', {})).toBe('empty');
  });

  it('calls a partly filled section a draft', () => {
    expect(deriveSectionStatus('bios', { short: 'A singer from Lagos.' })).toBe('draft');
  });

  it('calls a fully filled section ready', () => {
    expect(
      deriveSectionStatus('bios', { short: 'a', medium: 'b', long: 'c' })
    ).toBe('ready');
  });

  it('treats whitespace as empty rather than as content', () => {
    expect(deriveSectionStatus('bios', { short: '   ', medium: '', long: '' })).toBe('empty');
  });

  it('counts a list section by its items', () => {
    expect(deriveSectionStatus('press', {})).toBe('empty');
    expect(deriveSectionStatus('press', { coverage: [] })).toBe('empty');
    expect(deriveSectionStatus('press', { coverage: [{ outlet: 'The Native' }] })).toBe('ready');
  });

  it('reads the assets section from the photo count, not from content', () => {
    expect(deriveSectionStatus('assets', {}, { photoCount: 0 })).toBe('empty');
    expect(deriveSectionStatus('assets', {}, { photoCount: 3 })).toBe('ready');
  });

  it('needs a name, a role and an email before contact is ready', () => {
    expect(deriveSectionStatus('contact', { contacts: [{ name: 'Ada' }] })).toBe('draft');
    expect(
      deriveSectionStatus('contact', {
        contacts: [{ name: 'Ada', role: 'Manager', email: 'ada@example.com' }],
      })
    ).toBe('ready');
  });

  it('holds a list at draft while ANY item is incomplete, not just all of them', () => {
    expect(
      deriveSectionStatus('contact', {
        contacts: [
          { name: 'Ada', role: 'Manager', email: 'ada@example.com' },
          { name: 'Tolu', role: 'Press' },
        ],
      })
    ).toBe('draft');
  });

  it('needs the date a number was true before it counts as filled', () => {
    expect(deriveSectionStatus('numbers', { stats: [{ label: 'Monthly listeners', value: '12000' }] })).toBe('draft');
    expect(
      deriveSectionStatus('numbers', {
        stats: [{ label: 'Monthly listeners', value: '12000', asOf: '2026-09-01' }],
      })
    ).toBe('ready');
  });
});

describe('deriveKitState', () => {
  const everySectionReady = () =>
    PRESS_KIT_SECTIONS.map((key) => section({ section: key, status: 'ready' }));

  it('is incomplete while any visible section is not ready', () => {
    const sections = everySectionReady();
    sections[3] = section({ section: sections[3].section, status: 'draft' });
    expect(deriveKitState(sections, null)).toBe('incomplete');
  });

  it('is ready once every visible section is ready', () => {
    expect(deriveKitState(everySectionReady(), null)).toBe('ready');
  });

  it('ignores a hidden section, because hiding is a decision not a gap', () => {
    const sections = everySectionReady();
    sections[5] = section({ section: sections[5].section, status: 'empty', hidden: true });
    expect(deriveKitState(sections, null)).toBe('ready');
  });

  it('stays published once it has been published, even mid-edit', () => {
    const sections = everySectionReady();
    sections[2] = section({ section: sections[2].section, status: 'draft' });
    expect(deriveKitState(sections, '2026-09-01T00:00:00.000Z')).toBe('published');
  });
});

describe('canPublishKit', () => {
  it('refuses while the contact block is not ready', () => {
    const sections = [
      section({ section: 'header', status: 'ready' }),
      section({ section: 'contact', status: 'draft' }),
    ];
    const result = canPublishKit(sections);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.reason).toContain('contact');
  });

  it('allows it once contact is ready', () => {
    const sections = [
      section({ section: 'header', status: 'draft' }),
      section({ section: 'contact', status: 'ready' }),
    ];
    expect(canPublishKit(sections).ok).toBe(true);
  });

  it('ignores a hidden contact block rather than treating it as satisfied', () => {
    const sections = [section({ section: 'contact', status: 'ready', hidden: true })];
    expect(canPublishKit(sections).ok).toBe(false);
  });
});

describe('hasUnpublishedChanges', () => {
  it('is true for a section that has never been published and has content', () => {
    expect(hasUnpublishedChanges(section({ section: 'bios', content: { short: 'a' } }))).toBe(true);
  });

  it('is false for an empty section that has never been published', () => {
    expect(hasUnpublishedChanges(section({ section: 'bios' }))).toBe(false);
  });

  it('is false when the draft matches what is live, whatever the key order', () => {
    expect(
      hasUnpublishedChanges(
        section({
          section: 'bios',
          content: { short: 'a', medium: 'b' },
          publishedContent: { medium: 'b', short: 'a' },
        })
      )
    ).toBe(false);
  });

  it('is true when the draft has moved on', () => {
    expect(
      hasUnpublishedChanges(
        section({ section: 'bios', content: { short: 'b' }, publishedContent: { short: 'a' } })
      )
    ).toBe(true);
  });
});

describe('sameContent', () => {
  it('ignores key order', () => {
    expect(sameContent({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
  });

  it('sees a real edit', () => {
    expect(sameContent({ a: '1' }, { a: '2' })).toBe(false);
  });

  it('compares nested lists by position', () => {
    expect(sameContent({ list: [{ x: 1 }, { y: 2 }] }, { list: [{ y: 2 }, { x: 1 }] })).toBe(false);
    expect(sameContent({ list: [{ x: 1 }] }, { list: [{ x: 1 }] })).toBe(true);
  });
});

describe('shouldCoalesceVersion', () => {
  const now = new Date('2026-09-05T12:00:00.000Z');

  it('starts a new version when the section has no history', () => {
    expect(shouldCoalesceVersion(null, 'user-1', now)).toBe(false);
  });

  it('folds into the newest version inside the window, by the same person', () => {
    expect(
      shouldCoalesceVersion(
        { createdAt: '2026-09-05T11:58:00.000Z', savedBy: 'user-1' },
        'user-1',
        now
      )
    ).toBe(true);
  });

  it('starts a new version once the window has passed', () => {
    expect(
      shouldCoalesceVersion(
        { createdAt: '2026-09-05T11:50:00.000Z', savedBy: 'user-1' },
        'user-1',
        now
      )
    ).toBe(false);
  });

  it('starts a new version for a different person, however recent', () => {
    expect(
      shouldCoalesceVersion(
        { createdAt: '2026-09-05T11:59:59.000Z', savedBy: 'user-2' },
        'user-1',
        now
      )
    ).toBe(false);
  });

  it('starts a new version rather than trusting an unreadable timestamp', () => {
    expect(shouldCoalesceVersion({ createdAt: 'not a date', savedBy: 'user-1' }, 'user-1', now)).toBe(
      false
    );
  });

  it('starts a new version when the newest row is somehow in the future', () => {
    expect(
      shouldCoalesceVersion(
        { createdAt: '2026-09-05T12:30:00.000Z', savedBy: 'user-1' },
        'user-1',
        now
      )
    ).toBe(false);
  });

  it('coalesces on a five minute window, so an 800ms debounce writes one row', () => {
    expect(VERSION_COALESCE_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});

describe('versionPruneCutoffIso', () => {
  it('cuts at thirty days before now', () => {
    expect(VERSION_RETENTION_DAYS).toBe(30);
    expect(versionPruneCutoffIso(new Date('2026-09-05T12:00:00.000Z'))).toBe(
      '2026-08-06T12:00:00.000Z'
    );
  });
});

/**
 * The roster cache's merge rule (2026-09-05).
 *
 * The press kits tab paints from a cached roster and revalidates behind it, so
 * a kit created or published on the detail page has to reach that roster
 * without a second round trip. These pin the merge that does it.
 */
describe('applyKitToRoster', () => {
  const entry = (
    artistId: string,
    kit: PressKitRosterEntry['kit'] = null
  ): PressKitRosterEntry => ({
    artistId,
    artistName: `Artist ${artistId}`,
    kit,
  });

  const kitFor = (artistId: string, over: Partial<PressKit> = {}): PressKit => ({
    id: `kit-${artistId}`,
    artistId,
    artistName: `Artist ${artistId}`,
    slug: `artist-${artistId}`,
    state: 'incomplete',
    visibility: 'public',
    embargoDate: null,
    availableForInterview: false,
    publishedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  });

  it('attaches a newly created kit to its artist', () => {
    const roster = [entry('a'), entry('b')];
    const next = applyKitToRoster(roster, kitFor('b'));
    expect(next[1].kit?.id).toBe('kit-b');
    expect(next[0].kit).toBeNull();
  });

  it('replaces the kit already on that artist, so a publish shows as live', () => {
    const roster = [entry('a', kitFor('a'))];
    const next = applyKitToRoster(roster, kitFor('a', { state: 'published' }));
    expect(next[0].kit?.state).toBe('published');
  });

  it('normalises the kit onto the roster name, which is the authority', () => {
    const roster = [entry('a')];
    const next = applyKitToRoster(roster, kitFor('a', { artistName: 'Stale copy' }));
    // Both halves: the row's own name, and the kit's copy of it — the single
    // kit screen reads the second one for its heading, so a rename that has
    // not reached the kit row must not travel back onto the tab.
    expect(next[0].artistName).toBe('Artist a');
    expect(next[0].kit?.artistName).toBe('Artist a');
  });

  it('never invents a row for an artist the roster does not carry', () => {
    const roster = [entry('a')];
    const next = applyKitToRoster(roster, kitFor('ghost'));
    expect(next).toHaveLength(1);
    expect(next[0].artistId).toBe('a');
  });

  it('returns the same array when nothing changed, so the tab does not repaint', () => {
    const roster = [entry('a')];
    expect(applyKitToRoster(roster, kitFor('ghost'))).toBe(roster);
  });

  it('leaves every other artist untouched', () => {
    const roster = [entry('a', kitFor('a')), entry('b'), entry('c', kitFor('c'))];
    const next = applyKitToRoster(roster, kitFor('b'));
    expect(next[0]).toBe(roster[0]);
    expect(next[2]).toBe(roster[2]);
  });
});
