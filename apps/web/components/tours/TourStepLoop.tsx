'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { TourLoopId } from '@/lib/tours';

/**
 * A tour step's short loop (#971), the way docs/notes/2026-11-01-stageshow-kit.md
 * says to load one: the Stageshow kit comes in a lazy chunk after mount, the
 * poster still holds the space until then, and under reduced motion only the
 * poster ever shows (the kit is not even downloaded).
 *
 * The posters are stills of the same loops, light and dark, at the stage's
 * exact size (320 x 184; the menu step's phone scene is 302 x 196 and shows
 * below a 370px viewport, where the card's inner width, less its 1px border
 * and 16px padding each side, drops under the stage's 312px switch). Both themes render and CSS shows one (`.tour-poster-*` in
 * globals.css), so a theme switch never waits on a download. Retake all of
 * them together if a loop changes.
 *
 * Decorative: the step's title and caption carry the words, so it is hidden
 * from screen readers.
 */

const TourLoop = dynamic(() => import('./loops/TourLoops'), {
  ssr: false,
  loading: () => null,
});

const POSTER_DIR = '/images/tours';

/** `thumb` (the offer card): always the wide still, so a row of thumbnails
 *  keeps one height. */
export function TourPoster({ loop, thumb = false }: { loop: TourLoopId; thumb?: boolean }) {
  // The menu step has its own phone scene; the others scale the same scene.
  const phone = loop === 'menu' && !thumb;
  return (
    <>
      {(['light', 'dark'] as const).map((theme) => (
        <picture key={theme} className={`tour-poster-${theme}`}>
          {phone ? (
            <source media="(max-width: 369.98px)" srcSet={`${POSTER_DIR}/${loop}-phone-${theme}.webp`} />
          ) : null}
          <img
            src={`${POSTER_DIR}/${loop}-${theme}.webp`}
            alt=""
            width={320}
            height={184}
            loading="eager"
            decoding="async"
            className="block h-auto w-full rounded-[10px]"
          />
        </picture>
      ))}
    </>
  );
}

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

export function TourStepLoop({ loop }: { loop: TourLoopId }) {
  const motion = usePrefersMotion();
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[320px]">
      {/* The poster always holds the space; the loop, once its chunk arrives,
          paints over it at the same size, so the card never changes height and
          its placement never jumps. */}
      <TourPoster loop={loop} />
      {motion ? (
        <div className="absolute inset-0">
          <TourLoop loop={loop} />
        </div>
      ) : null}
    </div>
  );
}
