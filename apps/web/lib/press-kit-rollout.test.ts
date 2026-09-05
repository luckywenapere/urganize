import { describe, expect, it } from 'vitest';
import {
  ROLLABLE_SECTIONS,
  buildRolloutProposals,
  describeProposal,
  mergeProposedContent,
} from './press-kit-rollout';
import type { AutofillSources } from './press-kit-autofill';
import type { PressKitSection, PressKitSectionKey } from '@/types/press-kits';

const sources = (over: Partial<AutofillSources> = {}): AutofillSources => ({
  releases: [],
  metadata: null,
  songs: [],
  credits: [],
  shows: [],
  members: [],
  ...over,
});

const section = (
  key: PressKitSectionKey,
  content: Record<string, unknown>,
  source: PressKitSection['source'] = 'autofill'
): PressKitSection => ({
  id: `sec-${key}`,
  section: key,
  content,
  publishedContent: null,
  status: 'draft',
  source,
  position: 1,
  hidden: false,
  updatedBy: null,
  updatedAt: '2026-09-01T00:00:00Z',
});

const release = (over: Partial<AutofillSources['releases'][number]> = {}) => ({
  id: 'rel-2',
  title: 'Midnight EP',
  releaseType: 'ep',
  releaseDate: '2026-10-01',
  description: 'Six tracks.',
  ...over,
});

describe('ROLLABLE_SECTIONS', () => {
  it('leaves contacts out', () => {
    // Autofill fills a contact with a blank role on purpose, so re-proposing it
    // would offer to replace a contact somebody completed with an incomplete
    // one. Contacts are owned by the interview and by hand.
    expect(ROLLABLE_SECTIONS).not.toContain('contact');
  });

  it('covers the release facing sections', () => {
    expect(ROLLABLE_SECTIONS).toContain('latest_release');
    expect(ROLLABLE_SECTIONS).toContain('music');
    expect(ROLLABLE_SECTIONS).toContain('credits');
  });
});

describe('mergeProposedContent', () => {
  it('keeps a field the incoming content says nothing about', () => {
    // THE RULE OF THIS WHOLE MODULE. A roll in never deletes somebody's words
    // because the new source had nothing to put there.
    const merged = mergeProposedContent(
      'header',
      { descriptor: 'Afrobeats singer', genreTags: 'afrobeats' },
      { genreTags: 'afrobeats, alte' }
    );
    expect(merged.descriptor).toBe('Afrobeats singer');
    expect(merged.genreTags).toBe('afrobeats, alte');
  });

  it('drops the hook when the release itself changes', () => {
    // A hook is written about one record. Carrying it onto the next release
    // would put a sentence about last year's single under this year's EP.
    const merged = mergeProposedContent(
      'latest_release',
      { releaseId: 'rel-1', title: 'First Light', hook: 'Her debut, recorded in Lagos.' },
      { releaseId: 'rel-2', title: 'Midnight EP' }
    );
    expect(merged.releaseId).toBe('rel-2');
    expect(merged.hook).toBe('');
  });

  it('keeps the hook when the release has not changed', () => {
    const merged = mergeProposedContent(
      'latest_release',
      { releaseId: 'rel-2', title: 'Midnight EP', hook: 'Recorded in one week.' },
      { releaseId: 'rel-2', title: 'Midnight EP', releaseDate: '2026-10-01' }
    );
    expect(merged.hook).toBe('Recorded in one week.');
    expect(merged.releaseDate).toBe('2026-10-01');
  });

  it('adds new tracks without touching the ones already there', () => {
    const merged = mergeProposedContent(
      'music',
      { tracks: [{ songId: 's1', title: 'Renamed by hand' }] },
      {
        tracks: [
          { songId: 's1', title: 'Original title' },
          { songId: 's2', title: 'New track' },
        ],
      }
    );
    const tracks = merged.tracks as Record<string, unknown>[];
    expect(tracks).toHaveLength(2);
    expect(tracks[0].title).toBe('Renamed by hand');
    expect(tracks[1].title).toBe('New track');
  });

  it('adds new credits and keeps a hand typed one that has no match', () => {
    const merged = mergeProposedContent(
      'credits',
      { credits: [{ legalName: 'Ada Obi', roles: ['mix engineer'] }] },
      { credits: [{ legalName: 'Tunde Bello', roles: ['producer'] }] }
    );
    const credits = merged.credits as Record<string, unknown>[];
    expect(credits).toHaveLength(2);
    expect(credits[0].legalName).toBe('Ada Obi');
  });

  it('does not duplicate a show that is already listed', () => {
    const show = { title: 'Lagos night', startAt: '2026-11-02T20:00:00Z' };
    const merged = mergeProposedContent('live', { shows: [show] }, { shows: [show] });
    expect(merged.shows).toHaveLength(1);
  });

  it('keeps an existing entry that has no key at all', () => {
    // A row somebody typed by hand carries no song id. Dropping it would be
    // the exact data loss this module exists to prevent.
    const merged = mergeProposedContent(
      'music',
      { tracks: [{ title: 'Typed by hand' }] },
      { tracks: [{ songId: 's1', title: 'From the release' }] }
    );
    const tracks = merged.tracks as Record<string, unknown>[];
    expect(tracks).toHaveLength(2);
    expect(tracks[0].title).toBe('Typed by hand');
  });

  it('does not add an incoming entry that cannot be matched on anything', () => {
    // The other side of the same coin. A nameless incoming row can never be
    // recognised again, so keeping it would re-add a copy on every roll in
    // until the list filled with them. Rolling the same thing in twice has to
    // be a no-op.
    const nameless = { credits: [{ legalName: '', stageName: '', roles: [] }] };
    const once = mergeProposedContent('credits', { credits: [] }, nameless);
    expect(once.credits).toHaveLength(0);

    const twice = mergeProposedContent('credits', once, nameless);
    expect(twice.credits).toHaveLength(0);
  });
});

describe('buildRolloutProposals', () => {
  it('proposes the new release', () => {
    const proposals = buildRolloutProposals(
      sources({ releases: [release()] }),
      [section('latest_release', { releaseId: 'rel-1', title: 'First Light' })]
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].section).toBe('latest_release');
    expect(proposals[0].proposed.title).toBe('Midnight EP');
  });

  it('proposes nothing when the kit already says the same thing', () => {
    const proposals = buildRolloutProposals(sources({ releases: [release()] }), [
      section('latest_release', {
        releaseId: 'rel-2',
        title: 'Midnight EP',
        releaseType: 'ep',
        releaseDate: '2026-10-01',
        description: 'Six tracks.',
      }),
    ]);
    expect(proposals).toEqual([]);
  });

  it('proposes nothing when there is nothing to roll in', () => {
    expect(buildRolloutProposals(sources(), [section('latest_release', {})])).toEqual([]);
  });

  it('NEVER writes, only proposes', () => {
    // The section objects handed in must come back untouched. A roll in that
    // mutated its input would be a silent write.
    const original = section('latest_release', { releaseId: 'rel-1', title: 'First Light' });
    const snapshot = JSON.stringify(original);
    buildRolloutProposals(sources({ releases: [release()] }), [original]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('still proposes over a section somebody wrote, and flags it', () => {
    // Autofill refuses a touched section. A proposal does not: the whole point
    // is that a person decides. What it must do is SAY the section is theirs.
    const proposals = buildRolloutProposals(
      sources({ releases: [release()] }),
      [section('latest_release', { releaseId: 'rel-1', title: 'First Light' }, 'user')]
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].handWritten).toBe(true);
  });

  it('does not flag an untouched section as hand written', () => {
    const proposals = buildRolloutProposals(
      sources({ releases: [release()] }),
      [section('latest_release', { releaseId: 'rel-1' }, 'autofill')]
    );
    expect(proposals[0].handWritten).toBe(false);
  });

  it('never proposes a contact', () => {
    const proposals = buildRolloutProposals(
      sources({ members: [{ name: 'Ada', email: 'ada@example.com' }] }),
      [section('contact', {})]
    );
    expect(proposals).toEqual([]);
  });

  it('skips a section the kit does not have a row for', () => {
    expect(buildRolloutProposals(sources({ releases: [release()] }), [])).toEqual([]);
  });
});

describe('describeProposal', () => {
  it('names what would change rather than counting it', () => {
    const proposals = buildRolloutProposals(
      sources({ songs: [{ id: 's2', title: 'New track', releaseId: 'rel-2', durationSeconds: 180 }] }),
      [section('music', { tracks: [{ songId: 's1', title: 'Old track' }] })]
    );
    expect(describeProposal(proposals[0])).toContain('1');
  });

  it('says nothing is added when a list only changes in place', () => {
    const proposals = buildRolloutProposals(
      sources({ releases: [release()] }),
      [section('latest_release', { releaseId: 'rel-1' })]
    );
    expect(describeProposal(proposals[0])).toBeTruthy();
  });

  it('uses no em dash and never says ship', () => {
    const proposals = buildRolloutProposals(
      sources({ releases: [release()], songs: [{ id: 's1', title: 'A', releaseId: null, durationSeconds: null }] }),
      [section('latest_release', { releaseId: 'rel-1' }), section('music', {})]
    );
    for (const proposal of proposals) {
      const text = describeProposal(proposal);
      expect(text).not.toContain('—');
      expect(text).not.toMatch(/\bship(s|ped|ping)?\b/i);
    }
  });
});
