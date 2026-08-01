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
        className={`theme-shot-light ${shared}`}
      />
      <Image
        src={dark}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={`theme-shot-dark ${shared}`}
      />
    </>
  );
}
