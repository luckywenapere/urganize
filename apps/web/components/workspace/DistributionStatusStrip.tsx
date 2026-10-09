'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown } from '@/components/icons';
import {
  DistributionIssueList,
  DistributionRejectionList,
} from '@/components/releases/DistributionIssueList';
import { useDistributionStatus } from '@/components/releases/useDistributionStatus';

type DistributionStatusStripProps = {
  releaseId: string;
  /** Open the sheet that edits the rollout's title and release day. Passed only
   *  for the person who may (the owner). */
  onOpenDetails?: () => void;
  /** Open the Change artist dialog. Passed only for who may. */
  onChangeArtist?: () => void;
  /** False once the rollout reads Released (`distributionStripMode` in
   *  lib/distribution-strip-visibility): the "Fix these before you order
   *  distribution" / "Worth a look" list is a before-release check, so only a
   *  distributor's answer can still show. Defaults to true. */
  showReadiness?: boolean;
};

/**
 * The check before distribution, shown on the rollout itself (2026-10-09), so a
 * team sees a problem while they can still fix it calmly and not at the moment
 * they try to order.
 *
 * WHAT IT SHOWS, AND WHEN. The same list the Distribute scene shows, from the
 * same reader. It is there until a hand-off to the distributor has been
 * recorded; after that the list is no longer news, and the only thing worth a
 * line is anything the distributor sent back. A rollout with nothing to say gets
 * nothing at all: a "you're ready" banner on every release would be chrome that
 * teaches people to stop reading the banners.
 *
 * COLLAPSED BY DEFAULT. A new rollout with no details yet can carry eight items,
 * and a stack of them above the activities is the wall this app has been
 * removing from other screens. The header says what the list is and how many
 * there are; one tap opens it, with a Fix button on each item.
 *
 * NOT ON A RELEASED ROLLOUT (v1.92.5). Once the rollout reads Released (the
 * Catalogue's derived status), WorkspaceView passes `showReadiness={false}`:
 * the list is a check before release, and under a Released header it read as
 * if the release had not happened. A distributor's answer still shows.
 *
 * Mounted by WorkspaceView only while the
 * rollout's main view is showing: inside a scene the person is already working,
 * and the Distribute scene carries the same list.
 */
export function DistributionStatusStrip({
  releaseId,
  onOpenDetails,
  onChangeArtist,
  showReadiness = true,
}: DistributionStatusStripProps) {
  const { data } = useDistributionStatus(releaseId);
  const [open, setOpen] = useState(false);

  // Nothing until the check has answered: a failed or slow read draws no banner
  // rather than a wrong one.
  if (!data) return null;

  const issueCount = data.errors.length + data.warnings.length;
  const showIssues = showReadiness && !data.lastHandoffAt && issueCount > 0;
  // The newest answer only: the Distribute scene keeps the history.
  const rejections = data.rejections.slice(0, 1);
  if (!showIssues && rejections.length === 0) return null;

  const hasErrors = data.errors.length > 0;
  const bodyId = `distribution-status-${releaseId}`;

  return (
    <section aria-label="Check before distribution" className="mb-3 space-y-2">
      {rejections.length > 0 ? <DistributionRejectionList rejections={rejections} /> : null}

      {showIssues ? (
        <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="motion-focus flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover"
          >
            {hasErrors ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-status-error" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 text-sm font-semibold text-content-primary">
              {hasErrors ? 'Fix these before you order distribution' : 'Worth a look'}
            </span>
            <span className="shrink-0 font-mono text-xs text-content-tertiary">{issueCount}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
                open ? '' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
          </button>
          {open ? (
            <div id={bodyId} className="border-t border-stroke-subtle p-3">
              <DistributionIssueList
                releaseId={releaseId}
                errors={data.errors}
                warnings={data.warnings}
                onOpenDetails={onOpenDetails}
                onChangeArtist={onChangeArtist}
                skipFirstHeading
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
