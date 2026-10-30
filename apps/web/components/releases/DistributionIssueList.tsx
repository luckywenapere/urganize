'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle } from '@/components/icons';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { fixDestinationFor, type FixAvailability } from '@/lib/distribution-fix';
import { SKIPPABLE_WARNINGS, isSkippableWarning, type DistributionIssue } from '@/lib/distribution-rules';
import type { DistributionRejection } from '@/lib/distribution-server';

// Read here, not passed in: they are the same inlined flags the rollout menu
// reads, and a Fix button must only appear for a scene that exists.
const SCENE_FLAGS = {
  metadata: process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true',
  coverArt: process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true',
};

type DistributionIssueListProps = {
  releaseId: string;
  errors: DistributionIssue[];
  warnings: DistributionIssue[];
  /** Open the sheet that edits the rollout's title and release day. Pass it only
   *  for a person who may (the owner): a Fix button that can only fail is worse
   *  than none. */
  onOpenDetails?: () => void;
  /** Open the Change artist dialog. Same rule: only for who may. */
  onChangeArtist?: () => void;
  /**
   * Leave the first list's header off. For a caller that already shows it (the
   * status on the rollout puts the errors' header on its own toggle), so the
   * same sentence is not printed twice one line apart. A second list still gets
   * its header, since nothing above it names it.
   */
  skipFirstHeading?: boolean;
  /** Skip a warning the team has chosen to let go (SKIPPABLE_WARNINGS). Passed
   *  only where a skip can be saved; without it there is no Skip button. */
  onSkip?: (code: string) => Promise<void>;
};

/**
 * The two lists the check produces, each with its header and a Fix button per
 * item. Shared by the Distribute scene and the status on the rollout, so the
 * wording and the buttons cannot drift between them.
 *
 * It decides nothing about ORDERING: "Order anyway" and the order button live
 * where the order does. This is only the list.
 */
export function DistributionIssueList({
  releaseId,
  errors,
  warnings,
  onOpenDetails,
  onChangeArtist,
  skipFirstHeading = false,
  onSkip,
}: DistributionIssueListProps) {
  const { openScene } = useSceneOverlay();
  const [skipping, setSkipping] = useState<string | null>(null);

  const availability: FixAvailability = {
    ...SCENE_FLAGS,
    canEditDetails: Boolean(onOpenDetails),
    canChangeArtist: Boolean(onChangeArtist),
  };

  const fix = (issue: DistributionIssue) => {
    const destination = fixDestinationFor(issue.fieldPath, availability);
    if (!destination) return;
    if (destination.kind === 'scene') {
      openScene(destination.scene, releaseId, { field: destination.field });
    } else if (destination.kind === 'details') {
      onOpenDetails?.();
    } else {
      onChangeArtist?.();
    }
  };

  const renderList = (issues: DistributionIssue[], tone: 'error' | 'warning') => (
    <ul className="divide-y divide-stroke-subtle border border-stroke-default bg-bg-surface">
      {issues.map((issue, index) => {
        const canFix = fixDestinationFor(issue.fieldPath, availability) !== null;
        const canSkip = tone === 'warning' && Boolean(onSkip) && isSkippableWarning(issue.code);
        return (
          <li key={`${issue.code}-${index}`} className="flex items-start gap-3 px-4 py-3">
            {tone === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1 text-sm text-content-primary">{issue.message}</p>
            {canFix ? (
              <button
                type="button"
                onClick={() => fix(issue)}
                aria-label={`Fix: ${issue.message}`}
                className="motion-focus -my-2 inline-flex h-10 min-w-14 shrink-0 items-center justify-center self-center rounded-lg border border-stroke-control px-3 text-xs font-semibold text-brand transition-colors hover:bg-brand/10"
              >
                Fix
              </button>
            ) : null}
            {canSkip ? (
              <button
                type="button"
                disabled={skipping === issue.code}
                onClick={async () => {
                  setSkipping(issue.code);
                  try {
                    await onSkip?.(issue.code);
                  } finally {
                    setSkipping(null);
                  }
                }}
                aria-label={`${SKIPPABLE_WARNINGS[issue.code].label}: ${issue.message}`}
                className="motion-focus -my-2 inline-flex h-10 shrink-0 items-center justify-center self-center rounded-lg px-3 text-xs font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary disabled:opacity-55"
              >
                {SKIPPABLE_WARNINGS[issue.code].label}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-5">
      {errors.length > 0 ? (
        <section
          aria-labelledby={skipFirstHeading ? undefined : `distribution-errors-${releaseId}`}
          aria-label={skipFirstHeading ? 'Fix these before you order distribution' : undefined}
        >
          {skipFirstHeading ? null : (
            <h3
              id={`distribution-errors-${releaseId}`}
              className="mb-2 text-sm font-semibold text-content-primary"
            >
              Fix these before you order distribution
            </h3>
          )}
          {renderList(errors, 'error')}
        </section>
      ) : null}
      {warnings.length > 0 ? (
        <section
          aria-labelledby={skipFirstHeading && errors.length === 0 ? undefined : `distribution-warnings-${releaseId}`}
          aria-label={skipFirstHeading && errors.length === 0 ? 'Worth a look' : undefined}
        >
          {skipFirstHeading && errors.length === 0 ? null : (
            <h3
              id={`distribution-warnings-${releaseId}`}
              className="mb-2 text-sm font-semibold text-content-primary"
            >
              Worth a look
            </h3>
          )}
          {renderList(warnings, 'warning')}
        </section>
      ) : null}
    </div>
  );
}

const formatDay = (iso: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(ms)
  );
};

/** What the distributor sent back, newest first. Renders nothing when empty. */
export function DistributionRejectionList({
  rejections,
}: {
  rejections: DistributionRejection[];
}) {
  if (rejections.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="What the distributor sent back">
      {rejections.map((rejection) => {
        const reason = rejection.reasonText ?? rejection.reasonCode;
        const when = formatDay(rejection.createdAt);
        return (
          <li
            key={rejection.id}
            className="flex items-start gap-3 border border-status-error/30 bg-status-error/5 px-4 py-3"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-content-primary">
              {reason ? (
                `The distributor sent this back: ${reason}`
              ) : (
                // TODO(copy): the brief gives the sentence for a rejection WITH a
                // reason; the partner's API may send none.
                'The distributor sent this back.'
              )}
              {when ? <span className="ml-2 text-xs text-content-tertiary">{when}</span> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
