'use client';

import { useState } from 'react';
import { Loader2 } from '@/components/icons';
import { PITCH_CLOSED_COPY, PITCH_MOVE_DATE_LABEL, PITCH_SKIP_LABEL } from '@/lib/editorial-pitch';
import { supabase } from '@/lib/supabase/client';

type EditorialPitchClosedBannerProps = {
  /** The open Spotify pitch task this banner is about. */
  taskId: string;
  /** Only the release owner can move the date (the schedule route is owner-only). */
  canMoveDate: boolean;
  onMoveDate: () => void;
  /** Fired after the pitch was skipped, so the caller refreshes the plan. */
  onSkipped: () => void;
  onError: (message: string) => void;
};

const BUTTON_CLASS =
  'motion-focus motion-press inline-flex h-11 items-center gap-2 rounded-full border border-stroke-control px-3.5 text-sm font-semibold text-content-primary transition-colors hover:border-content-secondary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Shown at the top of a rollout whose release day is 7 days away or less while
 * its Spotify pitch is still open: Spotify wants a pitch at least 7 days ahead,
 * so the window has closed. The two ways out are to move the release day (the
 * pitch task then moves with it) or to release without a pitch, which cancels
 * the task and records that it was a deliberate skip.
 *
 * It states the situation and offers the choice. Nothing is decided for the
 * team, and nothing here blocks anything else in the plan.
 */
export function EditorialPitchClosedBanner({
  taskId,
  canMoveDate,
  onMoveDate,
  onSkipped,
  onError,
}: EditorialPitchClosedBannerProps) {
  const [skipping, setSkipping] = useState(false);

  const skip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/tasks/${taskId}/editorial-pitch/skip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        onError(body.error || 'Could not skip the pitch.');
        return;
      }
      onSkipped();
    } catch {
      onError('Could not reach the server. Try again.');
    } finally {
      setSkipping(false);
    }
  };

  return (
    <section
      role="status"
      className="rounded-[24px] border border-status-warning/30 bg-status-warning/10 p-4"
    >
      <p className="text-sm font-semibold text-content-primary">{PITCH_CLOSED_COPY}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canMoveDate ? (
          <button type="button" onClick={onMoveDate} className={BUTTON_CLASS}>
            {PITCH_MOVE_DATE_LABEL}
          </button>
        ) : null}
        <button type="button" onClick={() => void skip()} disabled={skipping} className={BUTTON_CLASS}>
          {skipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {PITCH_SKIP_LABEL}
        </button>
      </div>
    </section>
  );
}
