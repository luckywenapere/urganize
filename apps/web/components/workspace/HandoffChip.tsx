'use client';

import { ChevronRight } from '@/components/icons';
import { useHandoff } from '@/components/releases/useHandoff';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { daysLate, formatDaysLate, formatHandoffDay, localYmd, sentCount } from '@/lib/handoff';

const MONO = 'font-mono text-[11px] uppercase tracking-[0.08em]';

/**
 * The handoff on the rollout line on a computer (URG-322, 2026-10-16): one
 * 36px chip, "Handoff · 0 of 3 sent · due Fri 30 Oct", red once the files are
 * late, opening the Distribute step. Draws nothing until the handoff has
 * answered, so a slow read never puts a wrong chip on the line.
 */
export function HandoffChip({ releaseId }: { releaseId: string }) {
  const { data } = useHandoff(releaseId);
  const { openScene } = useSceneOverlay();
  if (!data) return null;

  const sent = sentCount(data.items.map((item) => item.status));
  const allSent = sent === data.items.length;
  const late = !allSent && data.dueDate ? daysLate(data.dueDate, localYmd()) : 0;
  const tail = allSent
    ? null
    : late > 0
      ? formatDaysLate(late)
      : data.dueDate
        ? `due ${formatHandoffDay(data.dueDate)}`
        : null;
  const summary = [`${sent} of 3 sent`, tail].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => openScene('distribute', releaseId)}
      aria-label={`Handoff to distributor: ${summary}. Open Distribute`}
      className={`motion-focus inline-flex h-9 max-w-full items-center gap-2.5 border px-3.5 transition-colors hover:bg-bg-hover ${
        late > 0 ? 'border-status-error/40' : 'border-stroke-strong'
      }`}
    >
      {allSent ? (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brand" />
      ) : late > 0 ? (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-status-error" />
      ) : (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-content-tertiary" />
      )}
      <span className="shrink-0 text-[13px] text-content-primary">Handoff</span>
      <span className={`${MONO} truncate ${late > 0 ? 'text-status-error' : allSent ? 'text-brand' : 'text-content-secondary'}`}>
        {summary}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden="true" />
    </button>
  );
}
