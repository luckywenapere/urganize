'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from '@/components/icons';
import { formatClipLength } from '@/lib/idea-round';

/**
 * Play a kept voice idea (2026-10-27): a small pill with play or pause and the
 * clip's length. The link is signed for an hour; a stale one just fails to play.
 */
export function VoicePill({ url, seconds }: { url: string; seconds: number | null | undefined }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(url);
      audio.onended = () => setPlaying(false);
      audio.onpause = () => setPlaying(false);
      audio.onplay = () => setPlaying(true);
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };

  const length = formatClipLength(seconds);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? 'Pause the voice note' : 'Play the voice note'}
      className="motion-focus mt-1.5 inline-flex h-8 items-center gap-2 rounded-full border border-stroke-default bg-bg-elevated pl-1 pr-3 text-xs text-content-secondary hover:text-content-primary"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-content-inverse">
        {playing ? <Pause className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
      </span>
      {length || 'Voice note'}
    </button>
  );
}
