import { describe, expect, it } from 'vitest';

import {
  AUTOFILLABLE_SECTIONS,
  buildAutofillPatch,
  summarizeSources,
  type AutofillSources,
} from './press-kit-autofill';
import type { PressKitSection } from '@/types/press-kits';

const EMPTY_SOURCES: AutofillSources = {
  releases: [],
  metadata: null,
  songs: [],
  credits: [],
  shows: [],
  members: [],
};

const sources = (over: Partial<AutofillSources> = {}): AutofillSources => ({
  ...EMPTY_SOURCES,
  ...over,
});

const section = (
  key: PressKitSection['section'],
  over: Partial<PressKitSection> = {}
): PressKitSection => ({
  id: `section-${key}`,
  section: key,
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

/** Every section, all still untouched, which is a brand new kit. */
const freshSections = (): PressKitSection[] =>
  AUTOFILLABLE_SECTIONS.map((key) => section(key));

const patchFor = (key: PressKitSection['section'], result: ReturnType<typeof buildAutofillPatch>) =>
  result.find((entry) => entry.section === key);

describe('the source guard', () => {
  it('writes a section nobody has touched', () => {
    const result = buildAutofillPatch(
      sources({ shows: [{ title: 'Lagos', venueName: 'The Shrine', startAt: '2026-10-01T19:00:00Z', timezone: 'Africa/Lagos' }] }),
      freshSections()
    );
    expect(patchFor('live', result)).toBeTruthy();
  });

  it('NEVER writes a section a person has typed into', () => {
    const written = freshSections().map((entry) =>
      entry.section === 'live' ? { ...entry, source: 'user' as const } : entry
    );
    const result = buildAutofillPatch(
      sources({ shows: [{ title: 'Lagos', venueName: null, startAt: null, timezone: 'Africa/Lagos' }] }),
      written
    );
    expect(patchFor('live', result)).toBeUndefined();
  });

  it('NEVER writes a section UrgAns has drafted', () => {
    const written = freshSections().map((entry) =>
      entry.section === 'live' ? { ...entry, source: 'ai' as const } : entry
    );
    const result = buildAutofillPatch(
      sources({ shows: [{ title: 'Lagos', venueName: null, startAt: null, timezone: 'Africa/Lagos' }] }),
      written
    );
    expect(patchFor('live', result)).toBeUndefined();
  });

  it('writes nothing at all for a section that is not in the kit', () => {
    const result = buildAutofillPatch(
      sources({ shows: [{ title: 'Lagos', venueName: null, startAt: null, timezone: 'Africa/Lagos' }] }),
      []
    );
    expect(result).toEqual([]);
  });
});

describe('what autofill will not touch', () => {
  it('leaves the sections nothing in the product can answer', () => {
    const result = buildAutofillPatch(
      sources({
        releases: [{ id: 'r1', title: 'Ojuelegba', releaseType: 'single', releaseDate: '2026-08-01', description: 'A song.' }],
        metadata: { genre: 'Afrobeats', subgenre: null },
        songs: [{ id: 's1', title: 'Ojuelegba', releaseId: 'r1', durationSeconds: 200 }],
        credits: [{ legalName: 'Ada Obi', stageName: null, roles: ['producer'], contribution: 'Produced it.' }],
        shows: [{ title: 'Lagos', venueName: null, startAt: null, timezone: 'Africa/Lagos' }],
        members: [{ name: 'Ada', email: 'ada@example.com' }],
      }),
      freshSections()
    );
    const touched = result.map((entry) => entry.section);
    expect(touched).not.toContain('bios');
    expect(touched).not.toContain('numbers');
    expect(touched).not.toContain('press');
    expect(touched).not.toContain('links');
    expect(touched).not.toContain('assets');
    expect(touched).not.toContain('video');
  });

  it('never invents a figure, because there is no such data in the product', () => {
    expect(AUTOFILLABLE_SECTIONS).not.toContain('numbers');
  });

  it('writes nothing when there is nothing to write', () => {
    expect(buildAutofillPatch(EMPTY_SOURCES, freshSections())).toEqual([]);
  });
});

describe('latest release', () => {
  const releases = [
    { id: 'old', title: 'First', releaseType: 'single', releaseDate: '2025-01-01', description: '' },
    { id: 'new', title: 'Second', releaseType: 'ep', releaseDate: '2026-08-01', description: 'The new one.' },
  ];

  it('takes the newest release by date, not the first row', () => {
    const patch = patchFor('latest_release', buildAutofillPatch(sources({ releases }), freshSections()));
    expect(patch?.content.releaseId).toBe('new');
    expect(patch?.content.title).toBe('Second');
  });

  it('leaves the hook alone, because only a person can write it', () => {
    const patch = patchFor('latest_release', buildAutofillPatch(sources({ releases }), freshSections()));
    expect(patch?.content.hook).toBeUndefined();
  });

  it('prefers a dated release over an undated one', () => {
    const patch = patchFor(
      'latest_release',
      buildAutofillPatch(
        sources({
          releases: [
            { id: 'undated', title: 'No date', releaseType: 'single', releaseDate: null, description: '' },
            { id: 'dated', title: 'Dated', releaseType: 'single', releaseDate: '2026-01-01', description: '' },
          ],
        }),
        freshSections()
      )
    );
    expect(patch?.content.releaseId).toBe('dated');
  });
});

describe('credits', () => {
  it('carries only the four fields that belong on a public page', () => {
    const patch = patchFor(
      'credits',
      buildAutofillPatch(
        sources({
          credits: [
            {
              legalName: 'Ada Obi',
              stageName: 'ADA',
              roles: ['producer'],
              contribution: 'Produced it.',
              // Fields the caller must never be able to leak through, even by
              // handing them in.
              email: 'ada@example.com',
              ipiNumber: '00123456789',
              songwriterSplit: 50,
              phone: '+2348000000000',
            } as never,
          ],
        }),
        freshSections()
      )
    );
    const entry = (patch?.content.credits as Record<string, unknown>[])[0];
    expect(Object.keys(entry).sort()).toEqual(['contribution', 'legalName', 'roles', 'stageName']);
  });
});

describe('contact', () => {
  it('prefills a name and an email and leaves the role blank on purpose', () => {
    const patch = patchFor(
      'contact',
      buildAutofillPatch(sources({ members: [{ name: 'Ada', email: 'ada@example.com' }] }), freshSections())
    );
    expect((patch?.content.contacts as Record<string, unknown>[])[0]).toEqual({
      name: 'Ada',
      role: '',
      email: 'ada@example.com',
    });
  });

  it('skips a member with no email, since a contact without one is a dead end', () => {
    const patch = patchFor(
      'contact',
      buildAutofillPatch(
        sources({ members: [{ name: 'Ada', email: '' }, { name: 'Tolu', email: 'tolu@example.com' }] }),
        freshSections()
      )
    );
    expect(patch?.content.contacts).toHaveLength(1);
  });
});

describe('header', () => {
  it('fills genres from the release metadata and nothing else', () => {
    const patch = patchFor(
      'header',
      buildAutofillPatch(
        sources({
          releases: [{ id: 'r1', title: 'X', releaseType: 'single', releaseDate: '2026-01-01', description: '' }],
          metadata: { genre: 'Afrobeats', subgenre: 'alte' },
        }),
        freshSections()
      )
    );
    expect(patch?.content.genreTags).toBe('Afrobeats, alte');
    expect(patch?.content.descriptor).toBeUndefined();
    expect(patch?.content.homeCity).toBeUndefined();
  });

  it('writes no header at all when there is no genre', () => {
    const patch = patchFor(
      'header',
      buildAutofillPatch(sources({ metadata: { genre: null, subgenre: null } }), freshSections())
    );
    expect(patch).toBeUndefined();
  });
});

describe('summarizeSources', () => {
  it('counts what was found, for the card that says so', () => {
    expect(
      summarizeSources(
        sources({
          releases: [{ id: 'r1', title: 'X', releaseType: 'single', releaseDate: null, description: '' }],
          songs: [
            { id: 's1', title: 'A', releaseId: null, durationSeconds: null },
            { id: 's2', title: 'B', releaseId: null, durationSeconds: null },
          ],
          shows: [{ title: 'Lagos', venueName: null, startAt: null, timezone: 'Africa/Lagos' }],
        })
      )
    ).toEqual({ releases: 1, songs: 2, shows: 1, credits: 0, members: 0 });
  });
});
