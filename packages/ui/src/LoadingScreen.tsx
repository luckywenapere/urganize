'use client';

import Image from 'next/image';

// Variant / eyebrow are retained for backwards compatibility with existing
// call sites — the render below ignores them. Linear-style restraint: the
// brand mark + the title line, no mock layout decoys. There is deliberately
// no description/sub-line prop: load screens say one short thing, nothing
// more (founder call, 2026-08-19).
type LoadingScreenVariant = 'shell' | 'dashboard' | 'detail' | 'form';

type LoadingScreenProps = {
  eyebrow?: string;
  title?: string;
  variant?: LoadingScreenVariant;
  asPage?: boolean;
};

/**
 * The Urganize mark, gently pulsing, for full-screen loading moments
 * (founder request, 2026-08-05 — replaces the generic spinner with brand
 * identity, Linear-style). `next/image` on `/images/urganize-mark.png`,
 * which lives in `apps/web/public` — this component is web-app-only, do
 * not mount it from the homepage app. `app-wordmark` is the SAME class the
 * topbar wordmark uses for its light-theme invert (`globals.css`), reused
 * here rather than duplicated. `animate-pulse` is the breathing motion;
 * the app's global `prefers-reduced-motion` clamp (animation-duration to
 * 1ms) already collapses it to static for users who ask for less motion,
 * so no extra handling is needed here. Decorative — `alt=""` and
 * `aria-hidden`; the title text below carries the accessible name via the
 * container's `role="status"`.
 */
export function LoadingMark({ size = 48 }: { size?: number }) {
  return (
    <Image
      src="/images/urganize-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority
      className="app-wordmark animate-pulse"
    />
  );
}

export function LoadingScreen({
  title = 'Loading',
  asPage = true,
}: LoadingScreenProps) {
  // Just the mark, still, at the size and spot the phone app's splash draws it
  // (founder, 2026-10-14: the splash logo followed by a pulsing mark and an
  // "Opening Urganize" line read as two loaders). On the phone the splash hands
  // straight over to this frame, so it looks like one screen. The title stays
  // for screen readers only.
  const content = (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <Image
        src="/images/urganize-mark.png"
        alt=""
        aria-hidden="true"
        width={62}
        height={68}
        priority
        className="app-wordmark h-auto w-[62px]"
      />
      <span className="sr-only">{title}</span>
    </div>
  );

  if (asPage) {
    return <main className="bg-bg-base text-content-primary">{content}</main>;
  }
  return <div className="bg-bg-base text-content-primary">{content}</div>;
}
