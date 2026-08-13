import Image from "next/image";

// Product screenshots that follow the site's light/dark toggle (founder
// request, 2026-07-31). Renders BOTH captures; CSS keyed off the
// `data-marketing-theme` attribute (set in app/layout.tsx's pre-hydration
// script and by ThemeToggle) shows exactly one — see the `.theme-shot-*`
// rules in globals.css. Pure CSS on purpose: no "use client", no
// hydration mismatch, and the swap follows the toggle with zero flash
// because the same attribute the CSS reads is set before first paint.
//
// Same house rule as every other product screenshot on the site: both
// captures must show the current app. If the UI changes meaningfully,
// retake BOTH the light and dark version together — a stale one is worse
// than none.
//
// loading="eager" on both <Image>s is load-bearing, not a perf oversight:
// the theme-inactive capture starts life at `display: none`, and a
// `display: none` element never intersects the viewport, so the browser's
// native `loading="lazy"` never fires its fetch — flipping the class to
// `display: block` later does not retroactively trigger it. Without this,
// switching theme after mount reveals a screenshot that was never
// downloaded. `priority` was deliberately not used instead: it also adds
// fetchpriority="high" and a <link rel="preload">, which would compete
// with real above-the-fold assets for two below-the-fold decorative shots.
interface ThemedProductShotProps {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className?: string;
}

export function ThemedProductShot({
  light,
  dark,
  alt,
  width,
  height,
  sizes,
  className,
}: ThemedProductShotProps) {
  const shared = ["h-auto w-full", className].filter(Boolean).join(" ");
  return (
    <>
      <Image
        src={light}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading="eager"
        className={`theme-shot-light ${shared}`}
      />
      <Image
        src={dark}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading="eager"
        className={`theme-shot-dark ${shared}`}
      />
    </>
  );
}
