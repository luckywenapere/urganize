'use client';

import { useKnownTeammateCount } from './known-counts';

// This file held the whole Settings PAGE skeleton until 2026-09-29. Settings is
// a pop-up now and each segment carries its own loading states, so the page
// skeleton, its per-tab slot lists and the seven flag constants it re-declared
// (and kept missing) are gone. What is left is the one sub-region loader that
// TeammatesSection still uses; the filename is kept so that import is untouched.

/**
 * Used inline by `TeammatesSection` while the teammates list is fetching —
 * this one stays because it's a sub-region loader, not a duplicate of the
 * route-segment fallback.
 */
export function SettingsTeamMembersSectionSkeleton() {
  // Count-aware: renders the last-known number of teammate rows so the
  // resolved list lands where the placeholders stood.
  const teammateCount = useKnownTeammateCount(2, 6);
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: teammateCount }).map((_, index) => (
        <div
          key={`team-member-skeleton-${index}`}
          className="h-12 rounded-lg border border-stroke-subtle bg-bg-elevated"
        />
      ))}
    </div>
  );
}
