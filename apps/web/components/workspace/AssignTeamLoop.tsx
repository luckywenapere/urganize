'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * The plan-ready dialog's assign loop (#1009), loaded the way
 * docs/notes/2026-11-01-stageshow-kit.md says: the Stageshow kit comes in a
 * lazy chunk after mount, the poster still holds the space until then, and
 * under reduced motion only the poster ever shows (the kit is not downloaded).
 *
 * The posters are stills of the loop's last frame, light and dark, at the
 * stage's exact sizes: 448 x 172, and 278 x 222 for the phone scene. The
 * stage switches to its phone scene when its box is under 400px wide, which
 * in this dialog (16px page gutter, 1px border, 24px padding below 640px) is
 * a viewport under 482px, so the phone poster switches at the same width.
 * Both themes render and CSS shows one (`.tour-poster-*` in globals.css), so
 * a theme switch never waits on a download. Retake all four if the loop
 * changes.
 *
 * Decorative: the heading and the line above it carry the words, so it is
 * hidden from screen readers.
 */

const AssignLoop = dynamic(() => import('./assign-loop/AssignLoop'), {
  ssr: false,
  loading: () => null,
});

const POSTER_DIR = '/images/first-win';

function AssignPoster() {
  return (
    <>
      {(['light', 'dark'] as const).map((theme) => (
        <picture key={theme} className={`tour-poster-${theme}`}>
          <source
            media="(max-width: 481.98px)"
            srcSet={`${POSTER_DIR}/assign-phone-${theme}.webp`}
            width={278}
            height={222}
          />
          <img
            src={`${POSTER_DIR}/assign-${theme}.webp`}
            alt=""
            width={448}
            height={172}
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

export function AssignTeamLoop() {
  const motion = usePrefersMotion();
  return (
    <div aria-hidden="true" className="relative w-full">
      {/* The poster always holds the space; the loop paints over it at the
          same size once its chunk arrives, so the dialog never changes height. */}
      <AssignPoster />
      {motion ? (
        <div className="absolute inset-0">
          <AssignLoop />
        </div>
      ) : null}
    </div>
  );
}
