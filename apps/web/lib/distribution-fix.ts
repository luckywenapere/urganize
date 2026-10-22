/**
 * Where a Fix button sends the person (2026-10-09).
 *
 * A rule in lib/distribution-rules.ts says WHAT is wrong with WHICH thing, as a
 * field path. This turns the path into somewhere in the app, so a rule never
 * needs to know how the app is laid out and a layout change is one edit here.
 *
 * THREE KINDS OF DESTINATION, because the things a distributor asks for live in
 * three kinds of place:
 *
 *   scene     a release scene, optionally with a field to land on (the Metadata
 *             form's inputs, the Cover art and Song scenes)
 *   details   the sheet that edits the rollout's title and release day. Both
 *             are saved through the schedule route, which is owner-only
 *   artist    the Change artist dialog. Owner-only, and only offered when the
 *             team has more than one artist to choose from
 *
 * A fix that cannot work for THIS person is not offered (null): a Fix button
 * that can only fail is worse than none. That covers a scene that is switched
 * off, and the two owner-only edits for a teammate.
 *
 * Pure: no React, no environment reads. The caller says which scenes exist.
 */

import type { DistributionFieldPath } from './distribution-rules';
import type { SceneName } from './scene-cache';

/**
 * The inputs in the Metadata scene a fix can land on. Each is a stable element
 * id, `metadata-field-<name>`, on the real input, so the scene can focus it.
 * `credits` and `splits` are not inputs but the two steps that hold them (the
 * collect link, and the answers collected through it), and land on the step.
 */
export const METADATA_FIX_FIELDS = [
  'genre',
  'language',
  'explicit',
  'featured_artists',
  'credits',
  'splits',
  // The handoff to the distributor's Metadata row (URG-322) lands here when
  // the only thing missing is the words.
  'lyrics',
  // The pre-save link's "Add UPC" lands here.
  'upc',
] as const;

export type MetadataFixField = (typeof METADATA_FIX_FIELDS)[number];

export const isMetadataFixField = (value: string | null | undefined): value is MetadataFixField =>
  Boolean(value) && (METADATA_FIX_FIELDS as readonly string[]).includes(value as string);

/** The step of the Metadata scene a field sits in. */
export function metadataStepForField(field: MetadataFixField): 'details' | 'credits' | 'answers' {
  if (field === 'credits') return 'credits';
  if (field === 'splits') return 'answers';
  return 'details';
}

/** The element id the scene puts on a field's input, and on a step's card. */
export const metadataFieldElementId = (field: MetadataFixField): string => `metadata-field-${field}`;
export const metadataStepElementId = (step: 'details' | 'credits' | 'answers'): string =>
  `metadata-step-${step}`;

export type FixDestination =
  | { kind: 'scene'; scene: SceneName; field: MetadataFixField | null }
  | { kind: 'details' }
  | { kind: 'artist' };

/** Which scenes exist for this person right now (their feature switches). */
export type FixAvailability = {
  metadata: boolean;
  coverArt: boolean;
  /** The person may edit the rollout's title and release day (the owner). */
  canEditDetails: boolean;
  /** The person may change the artist (the owner, with more than one artist). */
  canChangeArtist: boolean;
};

const metadataAt = (available: FixAvailability, field: MetadataFixField): FixDestination | null =>
  available.metadata ? { kind: 'scene', scene: 'metadata', field } : null;

export function fixDestinationFor(
  fieldPath: DistributionFieldPath,
  available: FixAvailability
): FixDestination | null {
  switch (fieldPath) {
    case 'title':
    case 'release_date':
      return available.canEditDetails ? { kind: 'details' } : null;
    case 'artist':
      return available.canChangeArtist ? { kind: 'artist' } : null;
    case 'metadata.genre':
      return metadataAt(available, 'genre');
    case 'metadata.language':
      return metadataAt(available, 'language');
    case 'metadata.explicit':
      return metadataAt(available, 'explicit');
    case 'metadata.featured_artists':
      return metadataAt(available, 'featured_artists');
    case 'credits':
      return metadataAt(available, 'credits');
    case 'credits.splits':
      return metadataAt(available, 'splits');
    case 'artwork':
      return available.coverArt ? { kind: 'scene', scene: 'coverart', field: null } : null;
    default: {
      // A new field path with no destination here is a compile error, not a
      // button that silently does nothing.
      const unreachable: never = fieldPath;
      return unreachable;
    }
  }
}
