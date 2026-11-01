'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * The idea round invite's short loop (#1010): three teammates each add an
 * idea, the owner closes the round, one brief appears. Loaded the way
 * docs/notes/2026-11-01-stageshow-kit.md says: the Stageshow kit comes in a
 * lazy chunk after mount, the poster still holds the space until then, and
 * under reduced motion only the poster ever shows (the kit is not even
 * downloaded).
 *
 * The posters are stills of the loop, light and dark, at the stage's exact
 * size (320 x 212). Both render and CSS shows one (`.tour-poster-*` in
 * globals.css), so a theme switch never waits on a download. Retake both if
 * the loop changes.
 *
 * Decorative: the heading and the line above it carry the words, so it is
 * hidden from screen readers.
 */

const IdeaRoundStage = dynamic(() => import('./loops/IdeaRoundStage'), {
  ssr: false,
  loading: () => null,
});

const POSTER = '/images/idea-round/invite';

function usePrefersMotion(): boolean {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion(!mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return motion;
}

export function IdeaRoundLoop({ className = '' }: { className?: string }) {
  const motion = usePrefersMotion();
  return (
    <div aria-hidden="true" className={`pointer-events-none relative mx-auto w-full max-w-[320px] select-none ${className}`}>
      {/* The poster always holds the space; the loop paints over it at the
          same size once its chunk arrives, so nothing below it jumps. */}
      {(['light', 'dark'] as const).map((theme) => (
        <img
          key={theme}
          src={`${POSTER}-${theme}.webp`}
          alt=""
          width={320}
          height={212}
          loading="eager"
          decoding="async"
          className={`tour-poster-${theme} block h-auto w-full rounded-[12px]`}
        />
      ))}
      {motion ? (
        <div className="absolute inset-0">
          <IdeaRoundStage />
        </div>
      ) : null}
    </div>
  );
}
