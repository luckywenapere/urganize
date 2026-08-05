'use client';

import Image from 'next/image';

// Variant / eyebrow are retained for backwards compatibility with existing
// call sites — the render below ignores them. Linear-style restraint: the
// brand mark + the title line, no mock layout decoys.
type LoadingScreenVariant = 'shell' | 'dashboard' | 'detail' | 'form';

type LoadingScreenProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
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
 * `aria-hidden`; the title/description text below carries the accessible
 * name via the container's `role="status"`.
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
  description,
  asPage = true,
}: LoadingScreenProps) {
  const content = (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <LoadingMark />
        <p className="text-sm text-content-secondary">{title}</p>
        {description ? (
          <p className="max-w-xs text-xs text-content-tertiary">{description}</p>
        ) : null}
      </div>
    </div>
  );

  if (asPage) {
    return <main className="bg-bg-base text-content-primary">{content}</main>;
  }
  return <div className="bg-bg-base text-content-primary">{content}</div>;
}
