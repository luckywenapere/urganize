'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/lib/morph';
import { DistributionIssueList, DistributionRejectionList } from '@/components/releases/DistributionIssueList';
import { distributionAuthHeaders, useDistributionStatus } from '@/components/releases/useDistributionStatus';
import { useToast } from '@/components/shared/ToastProvider';
import { SKIPPABLE_WARNINGS } from '@/lib/distribution-rules';
import { issuesLeftOnRollout } from '@/lib/distribution-prep-tasks';
import { HandoffChip } from './HandoffChip';

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
  /** One 36px line for the timeline's phase row on a computer (2026-10-16). */
  compact?: boolean;
  /** The phone rollout view's divider row, "Before distribution 5/9 ›"
   *  (rollout declutter, Oct 18, 2026). */
  row?: boolean;
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
 * TASKS, NOT A CHECKLIST (#851, 2026-10-29, founder call). The checklist that
 * replaced the wall (2026-10-11) is gone too: what it asked for is three plan
 * tasks now (lib/distribution-prep-tasks.ts). This shows only the warnings,
 * any error no task covers, and the distributor's answer.
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
  compact = false,
  row = false,
}: DistributionStatusStripProps) {
  // The phone row is seeded from this session's last open answer, so it is
  // there on the first frame when the person comes back to the rollout.
  const { data, setData, seeded } = useDistributionStatus(releaseId, { seed: row });
  const { pushToast } = useToast();

  // "Skip pitch" and the like (Oct 31, 2026): saved on the rollout, so it is
  // gone for the whole team, then dropped from what is on screen.
  const skip = async (code: string) => {
    const headers = await distributionAuthHeaders();
    if (!headers) {
      pushToast('Your session expired. Sign in again.', 'error');
      return;
    }
    try {
      const response = await fetch(`/api/releases/${releaseId}/distribution/skip`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        pushToast(String(body?.error || 'Could not skip it. Try again.'), 'error');
        return;
      }
    } catch {
      pushToast('Could not reach the server. Check your connection and try again.', 'error');
      return;
    }
    setData((current) =>
      current ? { ...current, warnings: current.warnings.filter((issue) => issue.code !== code) } : current
    );
    pushToast(SKIPPABLE_WARNINGS[code]?.done ?? 'Skipped.', 'success');
  };

  // THE COMPUTER'S LINE IS THE HANDOFF NOW (URG-322, 2026-10-16). The one 36px
  // line beside the timeline's phases shows the handoff chip ("Handoff · 0 of 3
  // sent · due Fri 30 Oct") instead of the browser-stored "3 of 8 done"
  // checklist: the handoff is stored on the server, so every teammate reads the
  // same line. The checklist still shows everywhere else (the phone, the
  // non-timeline views); it is hidden here, not removed.
  if (compact) {
    const rejections = data ? data.rejections.slice(0, 1) : [];
    if (!showReadiness && rejections.length === 0) return null;
    return (
      <section aria-label="Handoff to distributor" className="flex flex-wrap items-center gap-2">
        {rejections.length > 0 ? <DistributionRejectionList rejections={rejections} /> : null}
        {showReadiness ? <HandoffChip releaseId={releaseId} /> : null}
      </section>
    );
  }

  // Nothing until the check has answered: a failed or slow read draws no banner
  // rather than a wrong one.
  if (!data) return null;

  // THE WORK IS IN THE PLAN NOW (#851, 2026-10-29, founder call). Genre,
  // language, explicit, songwriter credits and artwork are three ordinary tasks
  // (lib/distribution-prep-tasks.ts), so the checklist card is gone. What is
  // left here is what is not a to-do: a date that is tight, splits that do not
  // add up, and anything the distributor sent back.
  const showIssues = showReadiness && !data.lastHandoffAt;
  const left = showIssues ? issuesLeftOnRollout(data) : { errors: [], warnings: [] };
  // The newest answer only: the Distribute scene keeps the history.
  const rejections = data.rejections.slice(0, 1);
  if (rejections.length === 0 && left.errors.length + left.warnings.length === 0) return null;

  const section = (
    <section aria-label="Check before distribution" className={row ? 'space-y-2' : 'mb-3 space-y-2'}>
      {rejections.length > 0 ? <DistributionRejectionList rejections={rejections} /> : null}
      {left.errors.length + left.warnings.length > 0 ? (
        <DistributionIssueList
          releaseId={releaseId}
          errors={left.errors}
          warnings={left.warnings}
          onOpenDetails={onOpenDetails}
          onChangeArtist={onChangeArtist}
          onSkip={skip}
          skipFirstHeading
        />
      ) : null}
    </section>
  );
  // A row that arrives after the page has drawn opens its own space instead of
  // shoving the timeline down (morph-reveal, globals.css).
  if (row && !seeded) return <ArrivalReveal>{section}</ArrivalReveal>;
  return section;
}

/**
 * Opens from zero height to its own over 220ms the first time it renders,
 * fading in as it goes (Oct 18, 2026). Instant with reduced motion.
 */
function ArrivalReveal({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setRevealed(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="morph-reveal" data-revealed={revealed ? 'true' : 'false'}>
      <div>{children}</div>
    </div>
  );
}
