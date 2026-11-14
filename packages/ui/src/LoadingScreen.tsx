'use client';

import { useEffect } from 'react';
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

/**
 * Fired on window when a LoadingScreen mounts or unmounts. The site's native
 * appearance bridge listens, so the phone app's bars take the loading frame's
 * ground while it is up and the page's ground once it is gone.
 */
export const BOOT_LOADER_EVENT = 'urganize:boot-loader';

/**
 * The mark's width in CSS px: exactly what the phone app's launch screen draws.
 * The splash (apps/mobile/app.config.ts) draws icon-foreground.png 200pt wide;
 * that image is 1400px square with the mark 544px wide in its centre, so the
 * mark is 544 / 1400 * 200 = 77.7pt. It was 62px, which read as a second,
 * smaller logo after the splash (founder, 2026-10-18).
 */
export const BOOT_MARK_WIDTH = 77.7;

export function LoadingScreen({
  title = 'Loading',
  asPage = true,
}: LoadingScreenProps) {
  useEffect(() => {
    window.dispatchEvent(new Event(BOOT_LOADER_EVENT));
    return () => {
      window.dispatchEvent(new Event(BOOT_LOADER_EVENT));
    };
  }, []);

  // One frame for every boot-stage loader, and it is the phone app's launch
  // screen exactly, so the splash hands over to it invisibly (founder,
  // 2026-10-14 and again 2026-10-18: "double load screen"). Just the mark,
  // still, the title for screen readers only.
  //  - Ground: `.urg-boot-frame` (globals.css) paints the page ground, and
  //    inside the phone app the launch screen's own colour (--boot-ground,
  //    set before first paint by the shell script in app/layout.tsx).
  //  - Size: BOOT_MARK_WIDTH, the splash's mark size.
  //  - Spot: the splash centres the mark on the whole screen, the webview is
  //    inset by the safe area, so `.urg-boot-mark` moves the mark up by half
  //    the difference (--boot-shift, same script). 0 in a browser.
  const content = (
    <div
      className="urg-boot-frame relative flex min-h-screen items-center justify-center px-4"
      role="status"
      aria-live="polite"
      data-boot-loader=""
    >
      <Image
        src="/images/urganize-mark.png"
        alt=""
        aria-hidden="true"
        width={78}
        height={84}
        priority
        className="app-wordmark urg-boot-mark h-auto"
        style={{ width: `${BOOT_MARK_WIDTH}px` }}
      />
      <span className="sr-only">{title}</span>
    </div>
  );

  if (asPage) {
    return <main className="text-content-primary">{content}</main>;
  }
  return <div className="text-content-primary">{content}</div>;
}
