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
// THE PAGE'S FIRST PICTURE LOADS ONE THEME, NOT TWO (2026-11-12, #1224). Both
// variants used to be eager with fetchPriority="high", so a phone downloaded
// the light AND dark captures at top priority and they fought for the same
// slow connection (Coframe measured the hero's paint at 5.5s; Lighthouse put
// it down to the picture's load delay). Now, for a fetchPriority="high" shot:
// both <img> are lazy, so the preload scanner fetches neither, and a tiny
// inline script that runs before them preloads only the variant for the
// theme already set on <html> (the head script in layout.tsx sets it before
// the body is parsed), so the visible picture still starts downloading at
// once. After the page has loaded, the same script makes the hidden variant
// eager, so switching theme never reveals a picture that was never fetched
// (the lazy trap ThemedProductShot.tsx documents). Next's `priority` is still
// not used: it would preload both themes.
// Deliberately no hero-fade-in on it: an opacity-0 image is not a Largest
// Contentful Paint candidate until it is visible, so animating it would add
// the whole animation to LCP.
type Props = {
  desktop: ProductShot;
  phone: ProductShot;
  alt: string;
  /** `sizes` for the desktop source (matches the frame it renders in). */
  sizes: string;
  /**
   * `sizes` for the phone source. Defaults to the full viewport, which fits a
   * full-bleed capture; pass the real width when the frame is capped.
   */
  phoneSizes?: string;
  className?: string;
  /**
   * "high" for the first product visual on a page (the homepage hero, where it
   * is the Largest Contentful Paint candidate); "auto" for one further down,
   * so two captures do not compete with the real above-the-fold assets;
   * "low" for a capture mounted after load (the hero's Artists tab).
   */
  fetchPriority?: "high" | "auto" | "low";
};

export function ResponsiveProductShot({
  desktop,
  phone,
  alt,
  sizes,
  phoneSizes = "100vw",
  className = "",
  fetchPriority = "high",
}: Props) {
  const oneTheme = fetchPriority === "high";
  const shotId = shotKey(desktop.light);
  return (
    <>
      {oneTheme ? (
        <script
          // Our own constants (optimizer URLs and a key); nothing user-supplied.
          dangerouslySetInnerHTML={{ __html: preloadScript(shotId, desktop, phone, sizes, phoneSizes) }}
        />
      ) : null}
      <ThemedPicture theme="light" desktop={desktop} phone={phone} alt={alt} sizes={sizes} phoneSizes={phoneSizes} className={className} fetchPriority={fetchPriority} lazy={oneTheme} shotId={shotId} />
      <ThemedPicture theme="dark" desktop={desktop} phone={phone} alt={alt} sizes={sizes} phoneSizes={phoneSizes} className={className} fetchPriority={fetchPriority} lazy={oneTheme} shotId={shotId} />
    </>
  );
}

/** A short stable key per capture, so a page with two shots keeps them apart. */
function shotKey(src: string): string {
  let hash = 0;
  for (let i = 0; i < src.length; i++) hash = (hash * 31 + src.charCodeAt(i)) | 0;
  return `s${(hash >>> 0).toString(36)}`;
}

function srcSetFor(shot: ProductShot, theme: "light" | "dark", sizes: string) {
  const { props } = getImageProps({ alt: "", src: shot[theme], width: shot.width, height: shot.height, sizes });
  return { srcSet: props.srcSet ?? "", sizes: props.sizes ?? sizes };
}

function preloadScript(
  shotId: string,
  desktop: ProductShot,
  phone: ProductShot,
  sizes: string,
  phoneSizes: string,
): string {
  const data = {
    light: { desk: srcSetFor(desktop, "light", sizes), phone: srcSetFor(phone, "light", phoneSizes) },
    dark: { desk: srcSetFor(desktop, "dark", sizes), phone: srcSetFor(phone, "dark", phoneSizes) },
  };
  return `(function(){try{var D=${JSON.stringify(data)};var t=document.documentElement.dataset.marketingTheme==="dark"?"dark":"light";var v=D[t];[["(min-width: 640px)",v.desk],["(max-width: 639px)",v.phone]].forEach(function(x){if(!x[1].srcSet)return;var l=document.createElement("link");l.rel="preload";l.as="image";l.setAttribute("imagesrcset",x[1].srcSet);l.setAttribute("imagesizes",x[1].sizes);l.media=x[0];l.setAttribute("fetchpriority","high");document.head.appendChild(l);});var w=function(){document.querySelectorAll('img[data-shot="${shotId}"]').forEach(function(i){i.loading="eager";});};if(document.readyState==="complete")w();else window.addEventListener("load",w);}catch(e){}})();`;
}

function ThemedPicture({
  theme,
  desktop,
  phone,
  alt,
  sizes,
  phoneSizes,
  className,
  fetchPriority,
  lazy,
  shotId,
}: Props & { theme: "light" | "dark"; lazy: boolean; shotId: string }) {
  const common = { alt, loading: lazy ? ("lazy" as const) : ("eager" as const), fetchPriority };
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
    sizes: phoneSizes,
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
      <img {...phoneProps} alt={alt} data-shot={lazy ? shotId : undefined} className={`h-auto w-full ${className}`.trim()} />
    </picture>
  );
}
