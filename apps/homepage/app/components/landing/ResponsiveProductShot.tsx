import { getImageProps } from "next/image";
import type { ProductShot } from "@/content/product-shots";

// The hero's product shot, art-directed (2026-09-02): a PHONE capture below
// `sm`, the DESKTOP capture from `sm` up, each in light and dark. A desktop
// catalog squeezed to 390px is unreadable, and a phone visitor is looking at
// the very device the app is meant to run on.
//
// Why <picture> and not two hidden ThemedProductShots: an <img> that is
// `display: none` is still fetched (only `loading="lazy"` skips it, and lazy
// on the theme-inactive capture is exactly the trap ThemedProductShot.tsx
// documents). Two hidden shots per theme would cost a phone four downloads
// for one visible image. <picture> lets the BROWSER pick the source, so a
// phone downloads its two theme variants and a desktop its two. Next's
// getImageProps builds the optimizer srcSets; the <img> inside <picture> is
// the pattern @next/next/no-img-element explicitly allows.
//
// Both theme variants stay eager (the theme toggle can reveal either after
// mount) and carry fetchPriority="high" without Next's `priority`, which
// would also emit two <link rel="preload"> — one for a theme never shown.
// Deliberately no hero-fade-in on it: an opacity-0 image is not a Largest
// Contentful Paint candidate until it is visible, so animating it would add
// the whole animation to LCP.
type Props = {
  desktop: ProductShot;
  phone: ProductShot;
  alt: string;
  /** `sizes` for the desktop source (matches the frame it renders in). */
  sizes: string;
  className?: string;
};

export function ResponsiveProductShot({ desktop, phone, alt, sizes, className = "" }: Props) {
  return (
    <>
      <ThemedPicture theme="light" desktop={desktop} phone={phone} alt={alt} sizes={sizes} className={className} />
      <ThemedPicture theme="dark" desktop={desktop} phone={phone} alt={alt} sizes={sizes} className={className} />
    </>
  );
}

function ThemedPicture({
  theme,
  desktop,
  phone,
  alt,
  sizes,
  className,
}: Props & { theme: "light" | "dark" }) {
  const common = { alt, loading: "eager" as const, fetchPriority: "high" as const };
  const { props: desktopProps } = getImageProps({
    ...common,
    src: desktop[theme],
    width: desktop.width,
    height: desktop.height,
    sizes,
  });
  const { props: phoneProps } = getImageProps({
    ...common,
    src: phone[theme],
    width: phone.width,
    height: phone.height,
    sizes: "100vw",
  });
  return (
    <picture className={theme === "light" ? "theme-shot-light" : "theme-shot-dark"}>
      <source
        media="(min-width: 640px)"
        srcSet={desktopProps.srcSet}
        sizes={desktopProps.sizes}
        width={desktop.width}
        height={desktop.height}
      />
      <img {...phoneProps} alt={alt} className={`h-auto w-full ${className}`.trim()} />
    </picture>
  );
}
