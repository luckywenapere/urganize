'use client';

import dynamic from 'next/dynamic';
import { usePrefersMotion } from '@/lib/use-prefers-motion';

/**
 * The empty idea card's short loop (#1011): a voice note becomes a line of
 * text, then three plan rows. Loaded the way docs/notes/2026-11-01-stageshow-kit.md
 * says: the kit comes in a lazy chunk after mount, the poster still holds the
 * space until then, and under reduced motion only the poster ever shows (the
 * kit is not even downloaded).
 *
 * The posters are stills of the loop's last beat, light and dark, at the
 * stage's exact size (320 x 188). Both render and CSS shows one
 * (`.idea-poster-*` in globals.css), so a theme switch never waits on a
 * download. Retake both if the loop changes.
 *
 * Decorative: the line under the card's title carries the words, so it is
 * hidden from screen readers.
 */

const IdeaLoop = dynamic(() => import('./idea-loop/IdeaLoop'), {
  ssr: false,
  loading: () => null,
});

export function IdeaCardLoop({ className = '' }: { className?: string }) {
  const motion = usePrefersMotion();
  return (
    <div aria-hidden="true" className={`relative mx-auto w-full max-w-[320px] ${className}`}>
      {/* The poster always holds the space; the loop, once its chunk arrives,
          paints over it at the same size, so the card never changes height. */}
      {(['light', 'dark'] as const).map((theme) => (
        <img
          key={theme}
          src={`/images/idea-loop/idea-${theme}.webp`}
          alt=""
          width={320}
          height={188}
          loading="eager"
          decoding="async"
          className={`idea-poster-${theme} block h-auto w-full rounded-2xl`}
        />
      ))}
      {motion ? (
        <div className="absolute inset-0">
          <IdeaLoop />
        </div>
      ) : null}
    </div>
  );
}
