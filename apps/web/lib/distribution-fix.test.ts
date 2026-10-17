import { describe, expect, it } from 'vitest';
import { DISTRIBUTION_RULES, type DistributionFieldPath } from './distribution-rules';
import {
  METADATA_FIX_FIELDS,
  fixDestinationFor,
  isMetadataFixField,
  metadataFieldElementId,
  metadataStepElementId,
  metadataStepForField,
  type FixAvailability,
} from './distribution-fix';

const everything: FixAvailability = {
  metadata: true,
  
  coverArt: true,
  canEditDetails: true,
  canChangeArtist: true,
};

const nothing: FixAvailability = {
  metadata: false,
  
  coverArt: false,
  canEditDetails: false,
  canChangeArtist: false,
};

describe('every Fix button lands on the right field', () => {
  const expected: Array<[DistributionFieldPath, unknown]> = [
    ['title', { kind: 'details' }],
    ['release_date', { kind: 'details' }],
    ['artist', { kind: 'artist' }],
    ['metadata.genre', { kind: 'scene', scene: 'metadata', field: 'genre' }],
    ['metadata.language', { kind: 'scene', scene: 'metadata', field: 'language' }],
    ['metadata.explicit', { kind: 'scene', scene: 'metadata', field: 'explicit' }],
    ['metadata.featured_artists', { kind: 'scene', scene: 'metadata', field: 'featured_artists' }],
    ['credits', { kind: 'scene', scene: 'metadata', field: 'credits' }],
    ['credits.splits', { kind: 'scene', scene: 'metadata', field: 'splits' }],
    ['artwork', { kind: 'scene', scene: 'coverart', field: null }],
  ];

  for (const [path, destination] of expected) {
    it(`${path} goes where it should`, () => {
      expect(fixDestinationFor(path, everything)).toEqual(destination);
    });
  }

  it('has a destination for every field path any rule can raise', () => {
    const paths = new Set(DISTRIBUTION_RULES.map((rule) => rule.fieldPath));
    expect(paths.size).toBeGreaterThan(0);
    for (const path of paths) {
      expect(fixDestinationFor(path, everything), path).not.toBeNull();
    }
  });
});

describe('a fix that cannot work for this person is not offered', () => {
  it('offers nothing when every scene is off and the person cannot edit the rollout', () => {
    for (const rule of DISTRIBUTION_RULES) {
      expect(fixDestinationFor(rule.fieldPath, nothing), rule.code).toBeNull();
    }
  });

  it('hides a scene fix only for the scene that is switched off', () => {
    const noMetadata = { ...everything, metadata: false };
    expect(fixDestinationFor('metadata.genre', noMetadata)).toBeNull();
    expect(fixDestinationFor('credits', noMetadata)).toBeNull();
    expect(fixDestinationFor('artwork', noMetadata)).not.toBeNull();

    expect(fixDestinationFor('artwork', { ...everything, coverArt: false })).toBeNull();
  });

  it('keeps the title, the day and the artist for the people who can change them', () => {
    const teammate = { ...everything, canEditDetails: false, canChangeArtist: false };
    expect(fixDestinationFor('title', teammate)).toBeNull();
    expect(fixDestinationFor('release_date', teammate)).toBeNull();
    expect(fixDestinationFor('artist', teammate)).toBeNull();
    // A teammate can still fix everything that lives in a scene.
    expect(fixDestinationFor('metadata.genre', teammate)).not.toBeNull();
    expect(fixDestinationFor('artwork', teammate)).not.toBeNull();
  });
});

describe('the Metadata scene targets', () => {
  it('knows its seven fields and nothing else', () => {
    expect([...METADATA_FIX_FIELDS]).toEqual([
      'genre',
      'language',
      'explicit',
      'featured_artists',
      'credits',
      'splits',
      // The handoff's Metadata row (URG-322).
      'lyrics',
    ]);
    expect(isMetadataFixField('genre')).toBe(true);
    expect(isMetadataFixField('isrc')).toBe(false);
    expect(isMetadataFixField(null)).toBe(false);
    expect(isMetadataFixField('')).toBe(false);
  });

  it('puts each field in the step that holds it', () => {
    for (const field of ['genre', 'language', 'explicit', 'featured_artists'] as const) {
      expect(metadataStepForField(field), field).toBe('details');
    }
    expect(metadataStepForField('credits')).toBe('credits');
    expect(metadataStepForField('splits')).toBe('answers');
  });

  it('names its element ids in one place', () => {
    expect(metadataFieldElementId('genre')).toBe('metadata-field-genre');
    expect(metadataFieldElementId('featured_artists')).toBe('metadata-field-featured_artists');
    expect(metadataStepElementId('credits')).toBe('metadata-step-credits');
  });
});
