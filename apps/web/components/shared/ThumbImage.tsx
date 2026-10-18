'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * A small cover or face that never shows half painted (founder ask,
 * 2026-10-18: a rollout row's cover streamed in top to bottom).
 *
 * - Hidden until the bytes are fully loaded AND decoded, then a quick fade.
 *   Until then the slot shows whatever sits behind it (each caller's fixed
 *   size placeholder box), so a slow phone sees a calm tile, never a strip.
 * - `loading="lazy"` + `decoding="async"`: off-screen rows do not compete
 *   with what is on screen, and decoding stays off the main thread.
 * - Explicit `width`/`height` so the browser reserves the box (no shift).
 * - A plain <img>, never next/image: these are short-lived signed Storage
 *   URLs (the optimizer would cache them past expiry and spend the Vercel
 *   Hobby image quota on every new token).
 *
 * Pass the small copy (`coverThumbUrl`, lib/image-thumb.ts) when there is
 * one; `src` falls back to the full image for older uploads.
 */
export function ThumbImage({
  src,
  alt = '',
  width,
  height,
  className = '',
  style,
  onError,
}: {
  src: string;
  alt?: string;
  /** Rendered CSS pixels; also the intrinsic box the browser reserves. */
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
  onError?: () => void;
}) {
  // Keyed by src so a new image starts hidden again instead of swapping
  // half decoded into a visible tile.
  return (
    <ThumbImageInner
      key={src}
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      onError={onError}
    />
  );
}

function ThumbImageInner({
  src,
  alt,
  width,
  height,
  className,
  style,
  onError,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className: string;
  style?: CSSProperties;
  onError?: () => void;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  const reveal = () => {
    const image = ref.current;
    if (!image) return;
    // decode() resolves once the whole image can be painted in one go.
    if (typeof image.decode === 'function') {
      image.decode().then(
        () => setReady(true),
        () => setReady(true)
      );
    } else {
      setReady(true);
    }
  };

  // Already in the browser cache: it may have loaded before React attached
  // onLoad, so check once on mount rather than waiting forever.
  useEffect(() => {
    const image = ref.current;
    if (image && image.complete && image.naturalWidth > 0) reveal();
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; see above
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={reveal}
      onError={onError}
      style={style}
      className={`${className} transition-opacity duration-150 ease-out motion-reduce:transition-none ${
        ready ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}
