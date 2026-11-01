'use client';

import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import type { FallbackCounts } from '@/lib/directory-search';
import { EMPTY_STATE_ACTION_CLASS, EmptyState } from '@/components/shared/EmptyState';
import { DirectoryEmptyPreview } from '@/components/shared/EmptyPreviews';

/**
 * What the directory says when it has nothing to show.
 *
 * Designed before the happy path, because at this size most sessions will hit
 * one of these. The brief's rule: never render an empty result without saying
 * what exists nearby, so a manager always leaves with a next move rather than a
 * dead grid.
 *
 * EVERY NUMBER HERE IS REAL. A count that could not be computed is null and its
 * line does not render at all — no invented numbers anywhere, empty states
 * included.
 */

const line = 'text-sm text-content-secondary';
const nudge =
  'motion-focus rounded-lg border border-stroke-default px-3 py-1.5 text-sm text-content-primary hover:border-brand';

export function DirectoryEmptyState({
  nobodyListed,
  counts,
  role,
  city,
  hasQuery,
  onClearQuery,
  onDropRole,
  onDropCity,
  onShowOpen,
  onListMe,
}: {
  nobodyListed: boolean;
  counts: FallbackCounts;
  role: DirectoryRole | null;
  city: string | null;
  hasQuery: boolean;
  onClearQuery: () => void;
  onDropRole: () => void;
  onDropCity: () => void;
  onShowOpen: () => void;
  onListMe: () => void;
}) {
  // The honest first state. Nobody has opted in yet, so there is nothing to
  // broaden to and only one action that helps.
  if (nobodyListed) {
    return (
      <EmptyState
        title="Nobody is listed yet"
        description={
          <>
            {/* The phone keeps the short line so the button stays in view. */}
            <span className="hidden sm:inline">
              Managers find people here who have delivered the work a rollout needs.{' '}
            </span>
            It fills up as people add themselves.
          </>
        }
        // Who the directory will hold, faded, with made-up people (#969).
        preview={<DirectoryEmptyPreview />}
        action={
          <button
            type="button"
            onClick={onListMe}
            className={EMPTY_STATE_ACTION_CLASS}
          >
            Add yourself
          </button>
        }
      />
    );
  }

  const suggestions: { key: string; label: string; onClick: () => void }[] = [];

  if (role && counts.withoutRole !== null && counts.withoutRole > 0) {
    suggestions.push({
      key: 'role',
      label: `${counts.withoutRole} without the ${DIRECTORY_ROLE_LABELS[role].toLowerCase()} filter`,
      onClick: onDropRole,
    });
  }

  if (city && counts.withoutCity !== null && counts.withoutCity > 0) {
    suggestions.push({
      key: 'city',
      label: `${counts.withoutCity} outside ${city}`,
      onClick: onDropCity,
    });
  }

  if (counts.openToWork > 0) {
    suggestions.push({
      key: 'open',
      label: `${counts.openToWork} open to work`,
      onClick: onShowOpen,
    });
  }

  return (
    <div className="rounded-xl border border-stroke-default p-6">
      <h3 className="text-base font-semibold text-content-primary">Nobody matches that</h3>
      {hasQuery ? (
        <p className={`mt-2 ${line}`}>
          No name matches what you typed. The filters are still on.
        </p>
      ) : (
        <p className={`mt-2 ${line}`}>Try widening it.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {hasQuery ? (
          <button type="button" onClick={onClearQuery} className={nudge}>
            Clear the search
          </button>
        ) : null}
        {suggestions.map((suggestion) => (
          <button key={suggestion.key} type="button" onClick={suggestion.onClick} className={nudge}>
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  );
}
