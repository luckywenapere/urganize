'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Shared loading placeholders for the release scene pages (Press kit,
 * Metadata) added 2026-08-04 to close two gaps an audit found:
 *
 * 1. EPK and Metadata's page-shell skeletons were hand-rolled, byte-for-byte
 *    identical inline JSX in two separate files (`EpkPageClient.tsx`,
 *    `MetadataPageClient.tsx`) — the exact copy-paste-instead-of-share
 *    pattern this codebase's own audits flag elsewhere. `ReleaseSceneHeaderSkeleton`
 *    replaces both.
 * 2. Once a page shell resolves, `EpkSection`/`MetadataSection` owned their
 *    OWN internal loaders — single generic `h-12`/`h-24` blocks that didn't
 *    reserve the actual shape of what loads in (a share-link card, or an
 *    8-field distribution-metadata grid). `ShareLinkCardSkeleton` and
 *    `MetadataFieldsSkeleton` fix that.
 */

/** Back link + artist eyebrow + release title — the header every release
 * scene page (calendar/epk/files/metadata) shares. */
export function ReleaseSceneHeaderSkeleton() {
  return (
    <div aria-hidden="true">
      <SkeletonBlock className="h-3 w-24" />
      <div className="mt-4 space-y-2">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-8 w-2/3" />
      </div>
    </div>
  );
}

/** The "create a shareable link" card pattern both EpkSection and
 * MetadataSection's credits-link section resolve to on a fresh release —
 * far more common than the "link already exists" toolbar, so this shape
 * (centered text line + button) is the one worth reserving. */
export function ShareLinkCardSkeleton() {
  return (
    <div className="mt-4 border border-stroke-default bg-bg-surface p-6 text-center" aria-hidden="true">
      <SkeletonBlock className="mx-auto h-3.5 w-64 max-w-full" />
      <SkeletonBlock className="mx-auto mt-3 h-9 w-48" />
    </div>
  );
}

// Matches MetadataSection's real field count exactly — 8 fields, now ordered
// easiest-first (Genre, Subgenre, Language, Label name, ISRC, UPC, ℗ line,
// © line) — so the resolved form doesn't visibly grow past the placeholder
// grid. Every field also carries a plain-English hint line under its input
// (2026-08-13), which is why each row below reserves three blocks and the grid
// gap matches the real form's `gap-4`.
const METADATA_FIELD_COUNT = 8;

/** The release-details distribution-metadata form: an 8-field 2-column grid
 * (label + input + hint per field) + an explicit-content checkbox row + a
 * Save button. */
export function MetadataFieldsSkeleton() {
  return (
    <div
      className="mt-4 grid grid-cols-1 gap-4 border border-stroke-default bg-bg-surface p-4 sm:grid-cols-2"
      aria-hidden="true"
    >
      {Array.from({ length: METADATA_FIELD_COUNT }).map((_, index) => (
        <div key={`field-${index}`}>
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="mt-1.5 h-9 w-full" />
          <SkeletonBlock className="mt-1.5 h-2.5 w-4/5" />
        </div>
      ))}
      <SkeletonBlock className="h-4 w-64 sm:col-span-2" />
      <SkeletonBlock className="h-9 w-32 sm:col-span-2" />
    </div>
  );
}
