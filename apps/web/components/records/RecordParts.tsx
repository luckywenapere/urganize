'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { SONG_STAGES, SONG_STAGE_LABELS, type SongStage } from '@/lib/next-records';

// Small pieces of the next record v2 (mocks approved 27 Oct 2026,
// docs/mocks/next-record-v2/mock.html): the cover tile, the four stage bars, a
// session's date block and the bottom sheet every rare action opens.

/** A flat cover: the picture when there is one, else the record's colour. */
export function CoverTile({
  color,
  url,
  size,
  className = '',
}: {
  color: string;
  url: string | null;
  size: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`shrink-0 overflow-hidden rounded-[10px] bg-cover bg-center ${className}`}
      style={{ width: size, height: size, backgroundColor: color, backgroundImage: url ? `url("${url}")` : undefined }}
    />
  );
}

/**
 * Four bars: Idea, Recording, Mixing, Done. Each bar is a button that moves
 * the song to that stage; the hit area is a full 44px tall, the bar drawn
 * small inside it, as the mock shows. On a computer (#1190) each bar is wide
 * enough to sit under its name in the tracklist's heading row.
 */
export function StageBars({
  title,
  stage,
  disabled,
  onPick,
}: {
  title: string;
  stage: SongStage;
  disabled?: boolean;
  onPick: (stage: SongStage) => void;
}) {
  const reached = SONG_STAGES.indexOf(stage);
  return (
    <span className="-my-2 flex shrink-0" role="group" aria-label={`Stage for ${title}: ${SONG_STAGE_LABELS[stage]}`}>
      {SONG_STAGES.map((value, index) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          aria-pressed={value === stage}
          aria-label={`${title}: ${SONG_STAGE_LABELS[value]}`}
          title={SONG_STAGE_LABELS[value]}
          onClick={() => onPick(value)}
          className="motion-focus grid h-11 w-[22px] place-items-center rounded-md disabled:cursor-not-allowed lg:w-[68px]"
        >
          <span
            className={`block h-1.5 w-4 rounded-full transition-colors duration-fast lg:w-14 ${
              index <= reached ? 'bg-brand' : 'bg-[rgb(var(--color-stroke)/0.14)]'
            }`}
          />
        </button>
      ))}
    </span>
  );
}

/** One bar per song, lit when it is done (the artist page's record row). */
export function DoneBars({ total, done }: { total: number; done: number }) {
  const shown = Math.min(total, 12);
  const lit = total > 12 ? Math.round((done / total) * 12) : done;
  if (shown === 0) return null;
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: shown }, (_, index) => (
        <span key={index} className={`block h-1.5 w-4 rounded-full ${index < lit ? 'bg-brand' : 'bg-[rgb(var(--color-stroke)/0.14)]'}`} />
      ))}
    </span>
  );
}

/** "Fri" over "31", or a dash for a session that only has words. */
export function DateBlock({ date, soon }: { date: string | null; soon: boolean }) {
  const parsed = date ? new Date(`${date}T00:00:00Z`) : null;
  return (
    <div
      aria-hidden
      className={`w-[42px] shrink-0 rounded-[10px] py-1 text-center ${soon ? 'bg-status-warning/15' : 'bg-bg-elevated'}`}
    >
      <small
        className={`block text-[10px] font-medium uppercase tracking-[0.06em] ${soon ? 'text-status-warning' : 'text-content-secondary'}`}
      >
        {parsed ? parsed.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) : 'When'}
      </small>
      <b className="block font-display text-[17px] font-normal leading-tight text-content-primary">
        {parsed ? parsed.getUTCDate() : '?'}
      </b>
    </div>
  );
}

/** A bottom sheet on phones, a centred panel on a computer (StartNextSheet's chrome). */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => lockBodyScroll(), []);
  // Opened only by a tap, so never on the server; the check keeps it honest.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" role="presentation">
      <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0" onClick={onClose} />
      <DialogPanel
        label={label}
        onClose={onClose}
        className="relative w-full rounded-t-[22px] border border-stroke-default bg-bg-elevated px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2.5 sm:max-w-[440px] sm:rounded-[22px] sm:p-6"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" />
        {children}
      </DialogPanel>
    </div>,
    document.body
  );
}
