'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * The plan loop beside "Add artist" on a new team's empty Artists page (#1007;
 * planned for Home, which now redirects to Artists, #876), loaded the way docs/notes/2026-11-01-stageshow-kit.md says: the Stageshow
 * kit comes in a lazy chunk after mount, the poster still holds the space until
 * then, and under reduced motion only the poster ever shows (the kit is not
 * even downloaded).
 *
 * The posters are stills of the loop's last frame, light and dark, at the
 * stage's exact size (440 x 300, and 358 x 300 for the phone scene the stage
 * switches to below a 420px container). Every one renders and CSS shows one
 * (`.plan-loop-*` in globals.css, by theme and by this box's own width), so a
 * theme switch never waits on a download. Retake all four together if the
 * loop changes: render `<PlanLoop still />` at 440 and 358 wide with each
 * theme's tokens, and capture the stage at 2x as WebP.
 *
 * Decorative: the title and the button beside it carry the words, so it is
 * hidden from screen readers. Fictional data only, never the user's.
 */

const PlanLoop = dynamic(() => import('./plan-loop/PlanLoop'), {
  ssr: false,
  loading: () => null,
});

const POSTER_DIR = '/images/artists';

function PlanLoopPoster() {
  return (
    <>
      {(['wide', 'phone'] as const).map((size) =>
        (['light', 'dark'] as const).map((theme) => (
          <img
            key={`${size}-${theme}`}
            src={`${POSTER_DIR}/plan-${size === 'phone' ? 'phone-' : ''}${theme}.webp`}
            alt=""
            width={size === 'phone' ? 358 : 440}
            height={300}
            loading="eager"
            decoding="async"
            className={`plan-loop-${size} plan-loop-${theme} block h-auto w-full rounded-[12px]`}
          />
        )),
      )}
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

export function PlanLoopDemo({ className = '' }: { className?: string }) {
  const motion = usePrefersMotion();
  return (
    <div aria-hidden="true" className={`plan-loop relative ${className}`}>
      {/* The poster always holds the space; the loop, once its chunk arrives,
          paints over it at the same size, so the page never moves. */}
      <PlanLoopPoster />
      {motion ? (
        <div className="absolute inset-0">
          <PlanLoop />
        </div>
      ) : null}
    </div>
  );
}
