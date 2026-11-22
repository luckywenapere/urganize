'use client';

import { useEffect } from 'react';
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from '@/components/icons/lucide';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { formatDuration } from '@/lib/music/rules';
import { useMusic } from './MusicProvider';
import { ExplicitMark, SaveButton } from './parts';
import { Vinyl } from './Vinyl';

const ICON_BUTTON =
  'motion-focus motion-press inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-content-primary transition-colors hover:bg-content-primary/[0.06]';

/** Play and pause: a solid circle in the text colour, like the mock. */
function PlayPause({ size }: { size: 'mini' | 'bar' | 'big' }) {
  const { isPlaying, toggle } = useMusic();
  const box = size === 'big' ? 'h-[66px] w-[66px]' : size === 'bar' ? 'h-11 w-11' : 'h-10 w-10';
  const glyph = size === 'big' ? 'h-6 w-6' : 'h-4 w-4';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className={`motion-focus motion-press inline-flex flex-none items-center justify-center rounded-full bg-content-primary text-bg-base transition-opacity hover:opacity-90 ${box}`}
    >
      {isPlaying ? <Pause className={`${glyph} fill-current`} /> : <Play className={`${glyph} fill-current`} />}
    </button>
  );
}

/**
 * The position as a tuning dial: tick marks, the played part in green, a thin
 * needle at the playhead, the times under it. The real slider lies invisibly
 * on top, so keyboard, touch and screen readers get a native control.
 */
function Dial({ className = '' }: { className?: string }) {
  const { position, duration, seek, current } = useMusic();
  const max = duration > 0 ? duration : current?.durationSeconds ?? 0;
  const fraction = max > 0 ? Math.min(1, position / max) : 0;
  return (
    <div className={`relative h-[30px] w-full ${className}`} data-no-swipe>
      <div className="music-ticks absolute inset-x-0 top-0 h-3.5" aria-hidden="true" />
      <div className="music-ticks-lit absolute left-0 top-0 h-3.5" style={{ width: `${fraction * 100}%` }} aria-hidden="true" />
      <div
        className="absolute -top-[3px] h-5 w-[3px] -translate-x-px rounded-sm bg-content-primary"
        style={{ left: `${fraction * 100}%` }}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-between text-xs tabular-nums text-content-tertiary" aria-hidden="true">
        <span>{formatDuration(position) || '0:00'}</span>
        <span>{formatDuration(max) || '0:00'}</span>
      </div>
      <input
        type="range"
        aria-label="Song position"
        aria-valuetext={`${formatDuration(position) || '0:00'} of ${formatDuration(max) || '0:00'}`}
        min={0}
        max={Math.max(1, Math.round(max))}
        step={1}
        value={Math.round(Math.min(position, max || position))}
        onChange={(event) => seek(Number(event.target.value))}
        disabled={max <= 0}
        className="peer absolute inset-x-0 top-0 h-[18px] w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span className="pointer-events-none absolute inset-x-0 -top-1 h-[22px] rounded peer-focus-visible:ring-2 peer-focus-visible:ring-brand" aria-hidden="true" />
    </div>
  );
}

/** The tonearm, resting on the record while it plays and lifted off when paused. */
function Tonearm({ playing }: { playing: boolean }) {
  return (
    <svg
      viewBox="0 0 90 200"
      fill="none"
      aria-hidden="true"
      className="absolute right-[2px] top-[-4px] h-[200px] w-[90px] origin-[78%_9%] transition-transform duration-500 motion-reduce:transition-none"
      style={{ transform: playing ? 'rotate(0deg)' : 'rotate(-18deg)' }}
    >
      <circle cx="70" cy="18" r="13" fill="#e6e1d6" stroke="rgba(26,22,17,.25)" />
      <circle cx="70" cy="18" r="4" fill="#1a1611" />
      <path d="M70 18 L72 120 L44 168" stroke="#4b4740" strokeWidth="4" strokeLinecap="round" />
      <rect x="34" y="160" width="20" height="13" rx="3" transform="rotate(-30 44 166)" fill="#1a1611" />
    </svg>
  );
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { current, isPlaying, next, previous, playError } = useMusic();
  useEffect(() => lockBodyScroll(), []);
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[170] flex flex-col bg-black/40" onClick={onClose}>
      <DialogPanel
        label="Now playing"
        onClose={onClose}
        className="mt-auto flex max-h-[96dvh] flex-col overflow-y-auto rounded-t-3xl border-t border-content-primary/[0.08] bg-bg-base px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 md:mx-auto md:my-auto md:w-full md:max-w-md md:rounded-3xl md:border"
      >
        <div onClick={(event) => event.stopPropagation()} className="flex flex-col items-center">
          <div className="flex w-full items-center justify-between">
            <button type="button" onClick={onClose} aria-label="Close player" className={`${ICON_BUTTON} -ml-2`}>
              <ChevronDown className="h-6 w-6" />
            </button>
            <p className="text-xs font-semibold text-content-tertiary">Now playing</p>
            <span className="h-10 w-10" aria-hidden="true" />
          </div>
          <div className="relative mt-3 h-[300px] w-[300px] max-w-full">
            <Vinyl
              track={current}
              spinning={isPlaying}
              grooves={10}
              className="absolute left-1 top-2.5 h-[280px] w-[280px] max-w-[calc(100%-8px)] shadow-[0_14px_30px_rgba(26,22,17,0.28)]"
            />
            <Tonearm playing={isPlaying} />
          </div>
          <p className="mt-5 w-full truncate text-[22px] font-bold tracking-[-0.03em] text-content-primary">
            {current.title}
            {current.explicit ? <ExplicitMark /> : null}
          </p>
          <p className="w-full truncate text-[14.5px] text-content-secondary">{current.artistName}</p>
          <Dial className="mt-5" />
          <div className="mt-4 flex w-full items-center justify-center gap-5">
            <button type="button" onClick={previous} aria-label="Previous song" className={ICON_BUTTON}>
              <SkipBack className="h-6 w-6" />
            </button>
            <PlayPause size="big" />
            <button type="button" onClick={next} aria-label="Next song" className={ICON_BUTTON}>
              <SkipForward className="h-6 w-6" />
            </button>
            <SaveButton track={current} />
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
 * The player. On a phone a floating card above the bottom edge: the little
 * record turning, the song, the heart, play and pause, and a thin line for the
 * position; tap it for the turntable. From md a bar along the bottom with the
 * dial inline.
 */
export function PlayerBar() {
  const { current, isPlaying, position, duration, fullPlayerOpen, setFullPlayerOpen, playError, next, previous } = useMusic();
  if (!current) return null;
  const max = duration > 0 ? duration : current.durationSeconds ?? 0;
  const fraction = max > 0 ? Math.min(1, position / max) : 0;

  return (
    <>
      {/* Phone */}
      <div className="fixed inset-x-2.5 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[60] md:hidden">
        <div className="relative flex h-16 items-center gap-2.5 rounded-[18px] border border-content-primary/[0.16] bg-bg-surface/90 pl-2.5 pr-2 shadow-[0_10px_28px_rgba(26,22,17,0.16)] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setFullPlayerOpen(true)}
            aria-label={`Open player for ${current.title}`}
            className="motion-focus flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left"
          >
            <Vinyl track={current} spinning={isPlaying} showInitials={false} grooves={5} className="h-11 w-11" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-content-primary">{current.title}</span>
              <span className="block truncate text-xs text-content-secondary">{playError ?? current.artistName}</span>
            </span>
          </button>
          <SaveButton track={current} className="h-10 w-10" />
          <PlayPause size="mini" />
          <span className="absolute inset-x-3.5 bottom-0 h-0.5 overflow-hidden rounded-full bg-content-primary/[0.08]" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${fraction * 100}%` }} />
          </span>
        </div>
      </div>

      {/* Tablet and computer */}
      <div className="fixed inset-x-0 bottom-0 z-[60] hidden border-t border-content-primary/[0.16] bg-bg-surface/90 backdrop-blur-md md:block">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center gap-4 px-8 lg:px-14">
          <button
            type="button"
            onClick={() => setFullPlayerOpen(true)}
            aria-label={`Open player for ${current.title}`}
            className="motion-focus flex w-[240px] min-w-0 flex-none items-center gap-3 rounded-lg text-left"
          >
            <Vinyl track={current} spinning={isPlaying} showInitials={false} grooves={5} className="h-[50px] w-[50px]" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-content-primary">{current.title}</span>
              <span className="block truncate text-[12.5px] text-content-secondary">{playError ?? current.artistName}</span>
            </span>
          </button>
          <div className="flex flex-none items-center gap-1">
            <button type="button" onClick={previous} aria-label="Previous song" className={ICON_BUTTON}>
              <SkipBack className="h-5 w-5" />
            </button>
            <PlayPause size="bar" />
            <button type="button" onClick={next} aria-label="Next song" className={ICON_BUTTON}>
              <SkipForward className="h-5 w-5" />
            </button>
          </div>
          <Dial className="mx-auto h-7 max-w-[560px] flex-1" />
          <SaveButton track={current} />
        </div>
      </div>

      {fullPlayerOpen ? <FullPlayer onClose={() => setFullPlayerOpen(false)} /> : null}
    </>
  );
}
