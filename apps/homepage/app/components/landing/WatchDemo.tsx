"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trackEvent } from "@/lib/analytics";

// Loaded on the first open, so the hero's first load carries none of it. The
// placeholder holds the loop's frame (phone 358x580, desktop 720x440) while
// the host and its poster arrive.
//
// The frame's width is capped by the viewport HEIGHT as well (11rem leaves
// room for the overlay's padding, the close button above and the video link below; 0.6172 and 1.6364
// are the phone and desktop aspect ratios), so on a short laptop or a small
// phone the whole overlay still fits and Close stays on screen.
const LOOP_FRAME = "mx-auto w-full max-w-[min(358px,calc((100dvh_-_11rem)*0.6172))] sm:max-w-[min(56rem,calc((100dvh_-_11rem)*1.6364))]";
const DemoLoop = dynamic(() => import("./demo-loop/DemoLoop").then((m) => m.DemoLoop), {
  ssr: false,
  loading: () => (
    <div className={`${LOOP_FRAME} aspect-[358/580] rounded-xl bg-white/5 sm:aspect-[720/440]`} />
  ),
});

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
// Two shapes (2026-09-02): the original pill, and a `link` variant. The hero
// uses the link so the primary button and the proof quote fit the first phone
// screen; a second pill there pushed the proof below the fold.
//
// ⚠️ THE LINK VARIANT OWNS ITS FULL STOP, and that is the fix for a real
// review finding rather than a stylistic choice. Do not move it back into the
// hero's prose.
//
// It owned an "Or" as well until 2026-09-11, when the terms line it followed
// ("3 days free. No card. Your whole team.") was removed on a founder call.
// A connector with no sentence in front of it is the same orphan in a new
// place, so it went with it and the control now stands alone. If a sentence
// ever returns above this, the "Or" belongs HERE, not in that sentence.
//
// It used to read `…Your whole team. Or <WatchDemo variant="link" />.`, which
// renders correctly for a person and leaves **"Or ."** for anything that reads
// the page as text and drops interactive elements — AI crawlers, SEO and
// readability tools, link-preview scrapers, reader modes. A reviewer reported
// exactly that on 2026-09-10 ("fix the stray 'Or .' under the CTA"), having
// read the page that way; the built HTML was `Or <button …>watch the
// demo</button>.`, so the connector and the stop were the two orphans left
// behind.
//
// With both inside the control the sentence before it is complete on its own,
// so a reader that drops the button sees "3 days free. No card. Your whole
// team." and nothing stray. Visually identical either way.
//
// The general rule, since this is a class of bug rather than one instance: a
// sentence must never depend on an interactive element for its grammar. If a
// control has to sit in prose, give it every word and mark it needs to stand
// alone. (Deliberately NOT enforced by a test — the honest pattern, a text
// node ending in a conjunction, fires just as readily on `foo and
// <strong>bar</strong>`, which is correct code. A guard that cries wolf is
// worse than this comment.)
//
// The overlay is portaled to document.body, and that is load-bearing, not
// style: the hero's `hero-fade-in` animation is forwards-filled and its
// final keyframe keeps `transform: translateY(0)`, and a transformed
// ancestor becomes the containing block for `position: fixed` — a
// non-portaled overlay would be trapped inside the hero. Safe from a
// hydration mismatch because the overlay only renders after a click.
//
// THE UrgANS LOOP (2026-11-01, #956, founder approved the mock). The overlay
// now opens on a short in-page loop of UrgAns (demo-loop/DemoLoop.tsx: a
// manager asks what is open, UrgAns answers and offers to assign the gap, the
// manager confirms), not on YouTube. The full video is one tap away under it
// and still mounts its iframe only on that tap. The loop sits here rather than
// in the hero itself because the hero already plays its own loop (#952) right
// under this link; two loops on one screen would compete, and a 440px frame
// here would push the proof line below the fold.
export function WatchDemo({ variant = "pill" }: { variant?: "pill" | "link" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [video, setVideo] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const openDemo = () => {
    setVideo(false);
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
          {/* The stop belongs to this control, not to the hero's prose — see
              the header. No aria-label narrowing this further: the accessible
              name has to contain the visible label (WCAG 2.5.3, Label in
              Name). The stop went on 2026-10-17 (URG-334): the hero link now
              stands alone under the form, not at the end of a sentence. */}
          Watch the demo
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
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 py-14"
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
                {video ? (
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
                ) : (
                  <>
                    <DemoLoop className={`${LOOP_FRAME} overflow-hidden rounded-xl`} />
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setVideo(true);
                          // This button unmounts with the loop; keep focus in the dialog.
                          closeRef.current?.focus();
                          trackEvent("demo_full_video_open", { variant });
                        }}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Watch the full video
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
