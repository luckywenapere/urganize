import type { CSSProperties } from "react";
import Image from "next/image";
import type { ShotCrop } from "@/content/product-shot-crops";

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
//
// `phoneCrop` (2026-10-10): below `sm` show only a window of the capture,
// scaled up to the column, instead of the whole desktop screenshot shrunk to
// about 0.18x. It is CSS on the SAME <img>, so a phone still downloads one
// image per theme and a desktop is untouched. The wrapper div (not the img)
// carries the theme class when a crop is set, because the crop box must hide
// with it or the inactive theme would leave an empty box behind. See
// content/product-shot-crops.ts for where the rectangles come from and what to
// do after retaking the shots.
interface ThemedProductShotProps {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className?: string;
  phoneCrop?: ShotCrop;
}

// A crop is only used on the capture it was measured on and only if it fits
// inside it; anything else falls back to the full image.
function usableCrop(crop: ShotCrop | undefined, width: number, height: number) {
  if (!crop) return undefined;
  if (crop.from[0] !== width || crop.from[1] !== height) return undefined;
  if (crop.w <= 0 || crop.h <= 0 || crop.x < 0 || crop.y < 0) return undefined;
  if (crop.x + crop.w > width || crop.y + crop.h > height) return undefined;
  return crop;
}

export function ThemedProductShot({
  light,
  dark,
  alt,
  width,
  height,
  sizes,
  className,
  phoneCrop,
}: ThemedProductShotProps) {
  const shared = ["h-auto w-full", className].filter(Boolean).join(" ");
  const crop = usableCrop(phoneCrop, width, height);
  if (crop) {
    // Where the image sits inside the crop box (the rules are in globals.css,
    // `.shot-crop`): the box takes the crop's aspect ratio, the image is made
    // width/crop.w times the box's width and moved up and left by the crop's
    // origin. Translate percentages are of the image's own size, which is why
    // they are fractions of the capture rather than of the box.
    const style = {
      "--crop-ar": `${crop.w} / ${crop.h}`,
      "--crop-w": `${(width / crop.w) * 100}%`,
      "--crop-x": `${-(crop.x / width) * 100}%`,
      "--crop-y": `${-(crop.y / height) * 100}%`,
    } as CSSProperties;
    // On a phone the image is displayed far wider than the column, so ask the
    // optimizer for a size that matches (the column is the viewport less 48px
    // of padding and 2px of frame). Without this it would pick a file sized
    // for the column and the zoomed crop would be soft.
    const cropSizes = `(max-width: 639px) calc((100vw - 50px) * ${(width / crop.w).toFixed(3)}), ${sizes}`;
    return (
      <>
        {(["light", "dark"] as const).map((theme) => (
          <div key={theme} className={`theme-shot-${theme} shot-crop`} style={style}>
            <Image
              src={theme === "light" ? light : dark}
              alt={alt}
              width={width}
              height={height}
              sizes={cropSizes}
              loading="eager"
              className={shared}
            />
          </div>
        ))}
      </>
    );
  }
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
