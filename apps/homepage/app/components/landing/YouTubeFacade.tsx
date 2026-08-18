"use client";

import { useState } from "react";

const VIDEO_ID = "8yDIA3rtC20";
const START_SECONDS = 0;

// Click-to-play facade: a static thumbnail instead of an eagerly-loaded
// iframe. The real YouTube embed pulls in its full player bundle (plus
// ad/analytics infrastructure) the moment it mounts, regardless of whether
// anyone plays it — this defers all of that until the visitor actually
// wants the video.
export function YouTubeFacade() {
  const [isPlaying, setIsPlaying] = useState(false);
  // maxresdefault isn't guaranteed to exist for every video (some return a
  // tiny placeholder instead of a real 404); hqdefault is guaranteed by
  // YouTube's own spec, so fall back to it on error rather than risk a
  // blank/broken thumbnail.
  const [thumbnailSrc, setThumbnailSrc] = useState(
    `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`
  );

  if (isPlaying) {
    return (
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube.com/embed/${VIDEO_ID}?start=${START_SECONDS}&autoplay=1`}
        title="Urganize product tour"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsPlaying(true)}
      aria-label="Play: Urganize product tour"
      className="group absolute inset-0 h-full w-full"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external
          thumbnail from a domain not worth adding to next/image's remote
          pattern allowlist for one hero image. */}
      <img
        src={thumbnailSrc}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setThumbnailSrc(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`)}
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--marketing-primary)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] transition-transform group-hover:scale-105 sm:h-20 sm:w-20">
          <svg
            viewBox="0 0 24 24"
            className="ml-1 h-7 w-7 fill-[var(--marketing-primary-text)] sm:h-8 sm:w-8"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
