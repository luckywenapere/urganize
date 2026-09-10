"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trackEvent } from "@/lib/analytics";

const VIDEO_ID = "8yDIA3rtC20";
const START_SECONDS = 0;

// The demo lives behind this control instead of sitting in the hero as a
// full-width 16:9 block (founder call, 2026-08-27): visitors scrolled
// straight past the big video, so only the people who actually want the
// demo open it. The YouTube iframe (and its whole player/ad/analytics
// bundle) still mounts only on demand — the perf property the old
// thumbnail facade existed for — and the initial page load fetches
// nothing from YouTube's CDN at all (the facade's i.ytimg.com thumbnail
// is gone with it).
//
// Two shapes (2026-09-02): the original pill, and a `link` variant that
// reads as the tail of a sentence ("3 days free. No card. Or watch the
// demo." — 14 originally, shortened 2026-09-10). The hero uses the link so
// the primary button, its terms line
// and the proof quote all fit in the first phone screen; a second pill
// there pushed the proof below the fold.
//
// The overlay is portaled to document.body, and that is load-bearing, not
// style: the hero's `hero-fade-in` animation is forwards-filled and its
// final keyframe keeps `transform: translateY(0)`, and a transformed
// ancestor becomes the containing block for `position: fixed` — a
// non-portaled overlay would be trapped inside the hero. Safe from a
// hydration mismatch because the overlay only renders after a click.
export function WatchDemo({ variant = "pill" }: { variant?: "pill" | "link" }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const openDemo = () => {
    setIsOpen(true);
    // GA is loaded site-wide (layout.tsx, afterInteractive) — this event is
    // the one signal that says how many visitors actually want the demo.
    trackEvent("demo_video_open", { variant });
  };

  useEffect(() => {
    if (!isOpen) return;
    // Captured now so the cleanup below focuses the button this open
    // started from (react-hooks/exhaustive-deps: ref values can change
    // before cleanup runs).
    const trigger = triggerRef.current;
    // Lock page scroll behind the overlay; restore whatever was there on
    // close (rather than assuming ""), so this never clobbers another lock.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Hand focus back to the trigger so a keyboard user isn't dropped at
      // the top of the document when the dialog unmounts.
      trigger?.focus();
    };
  }, [isOpen]);

  return (
    <>
      {variant === "link" ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={openDemo}
          className="cursor-pointer text-[var(--marketing-text)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
        >
          watch the demo
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={openDemo}
          className="group inline-flex items-center gap-3 rounded-full border border-[color:var(--marketing-border)] bg-[var(--marketing-surface-muted)] py-2.5 pl-3 pr-6 text-sm font-medium text-[var(--marketing-text)] transition-colors hover:border-[color:var(--marketing-primary)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--marketing-primary)] transition-transform group-hover:scale-105">
            <svg
              viewBox="0 0 24 24"
              className="ml-0.5 h-4 w-4 fill-[var(--marketing-primary-text)]"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          Watch the demo
        </button>
      )}

      {isOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Urganize product tour"
              // z-[100] clears the fixed header (z-50) and the hero CTA
              // block (z-[60]).
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4"
              onClick={() => setIsOpen(false)}
            >
              <div
                className="relative w-full max-w-4xl"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                  className="absolute -top-12 right-0 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    className="absolute inset-0 h-full w-full"
                    src={`https://www.youtube.com/embed/${VIDEO_ID}?start=${START_SECONDS}&autoplay=1`}
                    title="Urganize product tour"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
