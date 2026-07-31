'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';

export interface AudioPlayerProps {
  src: string;
  title?: string;
  waveformData?: number[] | null;
  durationSeconds?: number | null;
  compact?: boolean;
  className?: string;
  onPlay?: (currentTime: number) => void;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }

  const rounded = Math.floor(value);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function AudioPlayer({
  src,
  title = 'Audio preview',
  waveformData = null,
  durationSeconds = null,
  compact = false,
  className,
  onPlay,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [error, setError] = useState('');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(durationSeconds || 0);
    setError('');
  }, [durationSeconds, src]);

  const normalizedDuration = duration > 0 ? duration : durationSeconds || 0;
  const progressPercent =
    normalizedDuration > 0 ? Math.max(0, Math.min(100, (currentTime / normalizedDuration) * 100)) : 0;

  const waveformBars = useMemo(() => {
    if (!waveformData || waveformData.length === 0) {
      return [];
    }

    return waveformData.slice(0, compact ? 48 : 72);
  }, [compact, waveformData]);

  const seekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }

    const maxDuration = audio.duration || normalizedDuration || 0;
    const clamped = Math.max(0, Math.min(maxDuration, nextTime));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      if (audio.paused) {
        await audio.play();
        setIsPlaying(true);
        return;
      }

      audio.pause();
      setIsPlaying(false);
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : 'Could not play this audio.');
    }
  };

  const handleWaveformClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const nextTime = (audioRef.current?.duration || normalizedDuration || 0) * percent;
    seekTo(nextTime);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) {
      return;
    }

    if (event.key === ' ') {
      event.preventDefault();
      void togglePlayback();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekTo(currentTime + 5);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekTo(currentTime - 5);
    }
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={clsx(
        'rounded-[24px] border border-stroke-default bg-bg-elevated/80 p-4 text-content-primary outline-none transition focus-visible:ring-2 focus-visible:ring-brand',
        compact ? 'space-y-3' : 'space-y-4',
        className
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || durationSeconds || 0);
          setError('');
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={(event) => {
          setIsPlaying(true);
          onPlay?.(event.currentTarget.currentTime || 0);
        }}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => setIsBuffering(false)}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => setIsBuffering(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => setError('This audio file could not be played.')}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className={clsx(
            'inline-flex shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand text-content-inverse transition hover:bg-brand-hover',
            compact ? 'h-11 w-11' : 'h-12 w-12'
          )}
          aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
        >
          {isPlaying ? 'II' : '▶'}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-content-primary">{title}</p>
            <p className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-content-tertiary">
              {isBuffering ? 'Buffering' : isPlaying ? 'Playing' : 'Ready'}
            </p>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-content-secondary">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(normalizedDuration)}</span>
          </div>
        </div>
      </div>

      {waveformBars.length > 0 ? (
        <div
          aria-label={`Waveform for ${title}`}
          onClick={handleWaveformClick}
          className={clsx(
            'flex items-end gap-[2px] overflow-hidden rounded-[18px] border border-stroke-subtle bg-bg-base/70 px-2 py-3',
            compact ? 'h-16' : 'h-24'
          )}
        >
          {waveformBars.map((value, index) => {
            const percentThrough = waveformBars.length > 1 ? index / (waveformBars.length - 1) : 0;
            const isPlayed = percentThrough * 100 <= progressPercent;

            return (
              <span
                key={`${index}-${value}`}
                aria-hidden="true"
                className={clsx(
                  'block flex-1 rounded-full transition-colors',
                  isPlayed ? 'bg-brand' : 'bg-white/12'
                )}
                style={{
                  minHeight: compact ? '14%' : '12%',
                  height: `${Math.max(18, value * 100)}%`,
                }}
              />
            );
          })}
        </div>
      ) : null}

      <input
        type="range"
        min={0}
        max={Math.max(normalizedDuration, 1)}
        step={0.1}
        value={Math.min(currentTime, Math.max(normalizedDuration, 1))}
        onChange={(event) => seekTo(Number(event.target.value))}
        aria-label={`Scrub ${title}`}
        className="h-2 w-full appearance-none rounded-full bg-bg-overlay accent-brand"
      />

      {error ? <p className="text-xs text-status-error">{error}</p> : null}
    </div>
  );
}
