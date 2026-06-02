/**
 * Shared release-related types and utilities.
 * Extracted from lib/pre-save.ts during v1 cut so that task and combobox code
 * can keep working after the pre-save feature is deleted.
 */

export interface ReleaseOption {
  id: string;
  /** FK to artists.id. Empty string when the legacy lookup path returned a
   * release with no resolved artist row (production has none after
   * Migration 2's NOT NULL tightening; the empty-string fallback covers
   * pre-migration drift and the in-flight workspace-flag-off path). */
  artistId: string;
  artistName: string;
  title: string;
  releaseDate: string | null;
  coverArtUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export function formatReleaseDate(value: string | null): string {
  if (!value) {
    return 'Date TBA';
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date TBA';
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
