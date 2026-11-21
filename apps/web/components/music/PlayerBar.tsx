'use client';

import { useEffect } from 'react';
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { formatDuration } from '@/lib/music/rules';
import { useMusic } from './MusicProvider';
import { Cover, ExplicitMark, SaveButton } from './parts';

const ICON_BUTTON =
  'motion-focus motion-press inline-flex h-10 w-10 items-center justify-center rounded-full text-content-primary transition-colors hover:bg-bg-hover';

function ProgressBar({ className = '' }: { className?: string }) {
  const { position, duration, seek, current } = useMusic();
  const max = duration > 0 ? duration : current?.durationSeconds ?? 0;
  const fraction = max > 0 ? Math.min(1, position / max) : 0;
  // A plain track and fill, with the real slider laid invisibly on top so the
  // keyboard, touch and screen readers all get a native control.
  return (
    <div className={`relative h-5 w-full rounded-full focus-within:ring-2 focus-within:ring-brand ${className}`}>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-stroke-strong" aria-hidden="true" />
      <div
        className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
        style={{ width: `${fraction * 100}%` }}
        aria-hidden="true"
      />
      <input
        type="range"
        aria-label="Song position"
        min={0}
        max={Math.max(1, Math.round(max))}
        step={1}
        value={Math.round(Math.min(position, max || position))}
        onChange={(event) => seek(Number(event.target.value))}
        disabled={max <= 0}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </div>
  );
}

function Controls({ size = 'small' }: { size?: 'small' | 'large' }) {
  const { isPlaying, toggle, next, previous } = useMusic();
  const big = size === 'large';
  return (
    <div className={`flex items-center ${big ? 'gap-6' : 'gap-1'}`}>
      <button type="button" onClick={previous} aria-label="Previous song" className={ICON_BUTTON}>
        <SkipBack className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className={`motion-focus motion-press inline-flex items-center justify-center rounded-full bg-brand text-content-inverse transition-colors hover:bg-brand-hover ${
          big ? 'h-14 w-14' : 'h-10 w-10'
        }`}
      >
        {isPlaying ? <Pause className={big ? 'h-6 w-6' : 'h-5 w-5'} /> : <Play className={big ? 'h-6 w-6' : 'h-5 w-5'} />}
      </button>
      <button type="button" onClick={next} aria-label="Next song" className={ICON_BUTTON}>
        <SkipForward className="h-5 w-5" />
      </button>
    </div>
  );
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { current, position, duration, playError } = useMusic();

  // Lock the page behind the sheet while it is open.
  useEffect(() => lockBodyScroll(), []);

  if (!current) return null;
  const total = duration > 0 ? duration : current.durationSeconds ?? 0;

  return (
    <div className="fixed inset-0 z-[170] flex flex-col bg-black/50" onClick={onClose}>
      <DialogPanel
        label="Now playing"
        onClose={onClose}
        className="mt-auto flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-stroke-default bg-bg-surface px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 lg:mx-auto lg:mb-auto lg:max-w-md lg:rounded-3xl"
      >
        <div onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-stroke-strong" aria-hidden="true" />
          <button type="button" onClick={onClose} aria-label="Close player" className={`${ICON_BUTTON} -ml-2`}>
            <ChevronDown className="h-5 w-5" />
          </button>
          <div className="mx-auto mt-2 w-full max-w-[280px]">
            <Cover track={current} className="aspect-square w-full" textClass="text-5xl" />
          </div>
          <p className="mt-5 truncate text-lg font-semibold text-content-primary">
            {current.title}
            {current.explicit ? <ExplicitMark /> : null}
          </p>
          <p className="truncate text-sm text-content-secondary">{current.artistName}</p>
          <div className="mt-5">
            <ProgressBar />
            <div className="mt-1.5 flex justify-between text-xs tabular-nums text-content-secondary">
              <span>{formatDuration(position) || '0:00'}</span>
              <span>{formatDuration(total)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Controls size="large" />
            <SaveButton track={current} className="h-12 w-12" />
          </div>
          {playError ? (
            <p role="alert" className="mt-3 text-center text-xs text-status-error">
              {playError}
            </p>
          ) : null}
        </div>
      </DialogPanel>
    </div>
  );
}

/**
 * The player. On a phone it is a thin bar above the tabs that opens the full
 * player; on a laptop it is a full-width bar along the bottom with the controls
 * and the position inline, beside the menu.
 */
export function PlayerBar() {
  const { current, position, duration, fullPlayerOpen, setFullPlayerOpen, playError } = useMusic();
  if (!current) return null;
  const total = duration > 0 ? duration : current.durationSeconds ?? 0;

  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[60] px-2 lg:bottom-0 lg:left-[220px] lg:px-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-xl border border-stroke-default bg-bg-surface px-2.5 py-2 lg:max-w-none lg:rounded-none lg:border-x-0 lg:border-b-0 lg:px-5 lg:py-2.5">
          <button
            type="button"
            onClick={() => setFullPlayerOpen(true)}
            aria-label={`Open player for ${current.title}`}
            className="motion-focus flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left lg:max-w-[240px] lg:flex-none"
          >
            <Cover track={current} className="h-10 w-10" textClass="text-xs" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-content-primary">{current.title}</span>
              <span className="block truncate text-xs text-content-secondary">
                {playError ?? current.artistName}
              </span>
            </span>
          </button>
          <div className="lg:flex lg:flex-1 lg:items-center lg:gap-4">
            <div className="hidden lg:block lg:flex-none">
              <Controls />
            </div>
            <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
              <ProgressBar />
              <span className="flex-none text-xs tabular-nums text-content-secondary">
                {formatDuration(position) || '0:00'} / {formatDuration(total) || '0:00'}
              </span>
            </div>
            <MiniToggle />
          </div>
        </div>
      </div>
      {fullPlayerOpen ? <FullPlayer onClose={() => setFullPlayerOpen(false)} /> : null}
    </>
  );
}

/** The one button the phone's thin bar needs. Hidden on a laptop, where the full
 *  controls sit beside it. */
function MiniToggle() {
  const { isPlaying, toggle } = useMusic();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className="motion-focus motion-press inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand text-content-inverse transition-colors hover:bg-brand-hover lg:hidden"
    >
      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
    </button>
  );
}
